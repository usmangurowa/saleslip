import type {
  HotspotService,
  HotspotUser,
  SystemResource,
} from "@turbo/routeros";
import { assertTransition, buildPlans } from "@turbo/wifi";

import type { WifiDeps } from "../deps";
import type {
  CreateOrderInput,
  CreateVoucherInput,
  OrderRepository,
  WifiOrderRecord,
  WifiVoucherRecord,
} from "../orders";
import { createFulfilmentService } from "../fulfilment";
import { noopLogger } from "../logger";
import { OrderNotFoundError } from "../orders";

/** In-memory `OrderRepository` mirroring the Drizzle implementation's rules. */
export const createMemoryRepo = (now: () => Date = () => new Date()) => {
  const orders = new Map<string, WifiOrderRecord>();
  const vouchers = new Map<string, WifiVoucherRecord>();
  let seq = 0;

  const repo: OrderRepository = {
    createOrder: (input: CreateOrderInput) => {
      const id = `order-${++seq}`;
      const order: WifiOrderRecord = {
        id,
        channel: input.channel,
        planId: input.planId,
        phone: input.phone,
        email: input.email ?? null,
        telegramId: input.telegramId ?? null,
        mac: input.mac ?? null,
        ip: input.ip ?? null,
        loginUrl: input.loginUrl ?? null,
        amountKobo: input.amountKobo,
        paystackReference: id,
        paystackStatus: null,
        status: "pending",
        routerAttempts: 0,
        lastError: null,
        createdAt: now(),
        paidAt: null,
        fulfilledAt: null,
      };
      orders.set(id, order);
      return Promise.resolve(order);
    },
    getOrder: (id) => Promise.resolve(orders.get(id)),
    findByReference: (reference) =>
      Promise.resolve(
        [...orders.values()].find((o) => o.paystackReference === reference),
      ),
    transition: (id, to, patch = {}) => {
      const current = orders.get(id);
      if (!current) throw new OrderNotFoundError(id);
      assertTransition(current.status, to);
      const { incrementAttempts, ...fields } = patch;
      const next: WifiOrderRecord = {
        ...current,
        ...fields,
        status: to,
        routerAttempts: current.routerAttempts + (incrementAttempts ? 1 : 0),
      };
      orders.set(id, next);
      return Promise.resolve(next);
    },
    listAwaitingRouter: () =>
      Promise.resolve(
        [...orders.values()].filter(
          (o) => o.status === "paid" || o.status === "pending_router",
        ),
      ),
    listOrdersForTelegram: (telegramId, limit = 5) =>
      Promise.resolve(
        [...orders.values()]
          .filter(
            (o) => o.telegramId === telegramId && o.status === "fulfilled",
          )
          .slice(-limit),
      ),
    createVoucher: (input: CreateVoucherInput) => {
      const voucher: WifiVoucherRecord = {
        id: `voucher-${++seq}`,
        orderId: input.orderId,
        batchId: null,
        code: input.code,
        profile: input.profile,
        channel: input.channel,
        kind: input.kind ?? "primary",
        rosId: null,
        limitBytesTotal: input.limitBytesTotal ?? null,
        status: "active",
        createdAt: now(),
      };
      vouchers.set(voucher.id, voucher);
      return Promise.resolve(voucher);
    },
    getVoucherForOrder: (orderId) =>
      Promise.resolve(
        [...vouchers.values()].find(
          (v) => v.orderId === orderId && v.kind === "primary",
        ),
      ),
    getBonusVoucherForOrder: (orderId) =>
      Promise.resolve(
        [...vouchers.values()].find(
          (v) => v.orderId === orderId && v.kind === "bonus",
        ),
      ),
    setVoucherRosId: (id, rosId) => {
      const v = vouchers.get(id);
      if (v) vouchers.set(id, { ...v, rosId });
      return Promise.resolve();
    },
    voucherCodeExists: (code) =>
      Promise.resolve([...vouchers.values()].some((v) => v.code === code)),
    todaySummary: () => {
      const paid = [...orders.values()].filter((o) => o.paidAt !== null);
      return Promise.resolve({
        paidOrders: paid.length,
        revenueKobo: paid.reduce((sum, o) => sum + o.amountKobo, 0),
      });
    },
  };

  return { repo, orders, vouchers };
};

export const sampleResource: SystemResource = {
  uptime: "1d2h",
  version: "7.19.6",
  boardName: "hEX",
  cpuLoad: 3,
  freeMemory: 100,
  totalMemory: 200,
};

/** Scriptable `HotspotService`; `fail` makes every call reject with that error. */
export const createFakeHotspot = () => {
  const users = new Map<string, HotspotUser>();
  const calls: string[] = [];
  const state: { fail: Error | undefined } = { fail: undefined };
  let seq = 0;

  const guard = () => {
    if (state.fail) return Promise.reject(state.fail);
    return Promise.resolve();
  };

  const hotspot: HotspotService = {
    createHotspotUser: async (input) => {
      calls.push(`create:${input.name}`);
      await guard();
      const id = `*${(++seq).toString(16).toUpperCase()}`;
      users.set(input.name, {
        id,
        name: input.name,
        profile: input.profile,
        comment: input.comment,
        disabled: false,
        limitBytesTotal: input.limitBytesTotal,
        limitUptime: input.limitUptime,
      });
      return { id };
    },
    listUsers: async () => {
      await guard();
      return [...users.values()];
    },
    findUser: async (name) => {
      calls.push(`find:${name}`);
      await guard();
      return users.get(name);
    },
    listActive: async () => {
      await guard();
      return [];
    },
    removeUser: async (idOrName) => {
      await guard();
      users.delete(idOrName);
    },
    kick: async () => {
      await guard();
      return 0;
    },
    systemResource: async () => {
      await guard();
      return sampleResource;
    },
  };

  return { hotspot, users, calls, state };
};

export const testPlans = buildPlans({});

export interface TestDepsOptions {
  hotspot?: HotspotService;
  paystack?: WifiDeps["paystack"];
  paystackSecretKey?: string;
  publicBaseUrl?: string;
  telegramWebhookSecret?: string;
  telegramAdminIds?: string[];
  pingDb?: () => Promise<void>;
  now?: () => Date;
}

export const createTestDeps = (options: TestDepsOptions = {}) => {
  const now = options.now ?? (() => new Date("2025-01-15T10:00:00Z"));
  const memory = createMemoryRepo(now);
  const fulfilled: { order: WifiOrderRecord; voucher: WifiVoucherRecord }[] =
    [];
  const fulfilment = createFulfilmentService({
    repo: memory.repo,
    plans: testPlans,
    hotspot: options.hotspot,
    logger: noopLogger,
    now,
    onFulfilled: (order, voucher) => {
      fulfilled.push({ order, voucher });
    },
  });
  const deps: WifiDeps = {
    config: {
      brandName: "Test WiFi",
      supportPhone: "+2348000000000",
      publicBaseUrl: options.publicBaseUrl ?? "https://buy.example.test",
      paystackSecretKey: options.paystackSecretKey ?? "sk_test_secret",
      telegramWebhookSecret: options.telegramWebhookSecret,
      telegramAdminIds: options.telegramAdminIds ?? ["1"],
      timeZone: "UTC",
    },
    plans: testPlans,
    repo: memory.repo,
    paystack: options.paystack,
    hotspot: options.hotspot,
    fulfilment,
    logger: noopLogger,
    pingDb: options.pingDb ?? (() => Promise.resolve()),
    now,
  };
  return { deps, ...memory, fulfilment, fulfilled };
};
