import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { db as Database } from "@turbo/db/client";
import type {
  WifiOrderChannel,
  WifiOrderStatus,
  WifiVoucherChannel,
  WifiVoucherKind,
  WifiVoucherStatus,
} from "@turbo/db/schema";
import { wifiOrder, wifiVoucher } from "@turbo/db/schema";
import { assertTransition } from "@turbo/wifi";

export type Db = typeof Database;

export interface WifiOrderRecord {
  id: string;
  channel: WifiOrderChannel;
  planId: string;
  phone: string | null;
  email: string | null;
  telegramId: string | null;
  mac: string | null;
  ip: string | null;
  loginUrl: string | null;
  amountKobo: number;
  paystackReference: string;
  paystackStatus: string | null;
  status: WifiOrderStatus;
  routerAttempts: number;
  lastError: string | null;
  createdAt: Date;
  paidAt: Date | null;
  fulfilledAt: Date | null;
}

export interface WifiVoucherRecord {
  id: string;
  orderId: string | null;
  batchId: string | null;
  code: string;
  profile: string;
  kind: WifiVoucherKind;
  channel: WifiVoucherChannel;
  rosId: string | null;
  limitBytesTotal: number | null;
  status: WifiVoucherStatus;
  createdAt: Date;
}

export interface CreateOrderInput {
  channel: WifiOrderChannel;
  planId: string;
  phone?: string;
  email?: string;
  telegramId?: string;
  mac?: string;
  ip?: string;
  loginUrl?: string;
  amountKobo: number;
}

export interface CreateVoucherInput {
  orderId: string;
  code: string;
  profile: string;
  kind?: WifiVoucherKind;
  channel: WifiVoucherChannel;
  limitBytesTotal?: number;
}

export interface DailySummary {
  paidOrders: number;
  revenueKobo: number;
}

/**
 * Persistence boundary for the shop. Every status write goes through
 * `transition`, which enforces the state machine before touching the row.
 */
export interface OrderRepository {
  createOrder: (input: CreateOrderInput) => Promise<WifiOrderRecord>;
  getOrder: (id: string) => Promise<WifiOrderRecord | undefined>;
  findByReference: (reference: string) => Promise<WifiOrderRecord | undefined>;
  transition: (
    id: string,
    to: WifiOrderStatus,
    patch?: Partial<
      Pick<
        WifiOrderRecord,
        "paystackStatus" | "lastError" | "paidAt" | "fulfilledAt"
      >
    > & { incrementAttempts?: boolean },
  ) => Promise<WifiOrderRecord>;
  listAwaitingRouter: () => Promise<WifiOrderRecord[]>;
  listOrdersForTelegram: (
    telegramId: string,
    limit?: number,
  ) => Promise<WifiOrderRecord[]>;
  createVoucher: (input: CreateVoucherInput) => Promise<WifiVoucherRecord>;
  /** The paid plan voucher for an order (kind = `primary`). */
  getVoucherForOrder: (
    orderId: string,
  ) => Promise<WifiVoucherRecord | undefined>;
  setVoucherRosId: (id: string, rosId: string) => Promise<void>;
  voucherCodeExists: (code: string) => Promise<boolean>;
  todaySummary: (now?: Date) => Promise<DailySummary>;
}

export class OrderNotFoundError extends Error {
  constructor(public readonly orderId: string) {
    super(`order ${orderId} not found`);
    this.name = "OrderNotFoundError";
  }
}

const startOfDay = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const createOrderRepository = (db: Db): OrderRepository => {
  const getOrder: OrderRepository["getOrder"] = async (id) => {
    const [row] = await db
      .select()
      .from(wifiOrder)
      .where(eq(wifiOrder.id, id))
      .limit(1);
    return row;
  };

  return {
    createOrder: async (input) => {
      const id = crypto.randomUUID();
      const [row] = await db
        .insert(wifiOrder)
        .values({
          id,
          channel: input.channel,
          planId: input.planId,
          phone: input.phone,
          email: input.email,
          telegramId: input.telegramId,
          mac: input.mac,
          ip: input.ip,
          loginUrl: input.loginUrl,
          amountKobo: input.amountKobo,
          // Paystack references are our order ids so the webhook maps 1:1.
          paystackReference: id,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    },

    getOrder,

    findByReference: async (reference) => {
      const [row] = await db
        .select()
        .from(wifiOrder)
        .where(eq(wifiOrder.paystackReference, reference))
        .limit(1);
      return row;
    },

    transition: async (id, to, patch = {}) => {
      const current = await getOrder(id);
      if (!current) throw new OrderNotFoundError(id);
      assertTransition(current.status, to);
      const { incrementAttempts, ...fields } = patch;
      const [row] = await db
        .update(wifiOrder)
        .set({
          ...fields,
          status: to,
          ...(incrementAttempts
            ? { routerAttempts: sql`${wifiOrder.routerAttempts} + 1` }
            : {}),
        })
        .where(and(eq(wifiOrder.id, id), eq(wifiOrder.status, current.status)))
        .returning();
      // Lost a race with a concurrent transition; re-read and re-validate.
      if (!row) {
        const latest = await getOrder(id);
        if (!latest) throw new OrderNotFoundError(id);
        assertTransition(latest.status, to);
        return latest;
      }
      return row;
    },

    listAwaitingRouter: () =>
      db
        .select()
        .from(wifiOrder)
        .where(inArray(wifiOrder.status, ["paid", "pending_router"]))
        .orderBy(wifiOrder.createdAt),

    listOrdersForTelegram: (telegramId, limit = 5) =>
      db
        .select()
        .from(wifiOrder)
        .where(
          and(
            eq(wifiOrder.telegramId, telegramId),
            eq(wifiOrder.status, "fulfilled"),
          ),
        )
        .orderBy(desc(wifiOrder.createdAt))
        .limit(limit),

    createVoucher: async (input) => {
      const [row] = await db
        .insert(wifiVoucher)
        .values({
          orderId: input.orderId,
          code: input.code,
          profile: input.profile,
          kind: input.kind ?? "primary",
          channel: input.channel,
          limitBytesTotal: input.limitBytesTotal,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    },

    getVoucherForOrder: async (orderId) => {
      const [row] = await db
        .select()
        .from(wifiVoucher)
        .where(
          and(
            eq(wifiVoucher.orderId, orderId),
            eq(wifiVoucher.kind, "primary"),
          ),
        )
        .limit(1);
      return row;
    },

    setVoucherRosId: async (id, rosId) => {
      await db.update(wifiVoucher).set({ rosId }).where(eq(wifiVoucher.id, id));
    },

    voucherCodeExists: async (code) => {
      const [row] = await db
        .select({ id: wifiVoucher.id })
        .from(wifiVoucher)
        .where(eq(wifiVoucher.code, code))
        .limit(1);
      return row !== undefined;
    },

    todaySummary: async (now = new Date()) => {
      const [row] = await db
        .select({
          paidOrders: sql<number>`count(*)::int`,
          revenueKobo: sql<number>`coalesce(sum(${wifiOrder.amountKobo}), 0)::int`,
        })
        .from(wifiOrder)
        .where(
          and(
            inArray(wifiOrder.status, ["paid", "pending_router", "fulfilled"]),
            gte(wifiOrder.paidAt, startOfDay(now)),
          ),
        );
      return row ?? { paidOrders: 0, revenueKobo: 0 };
    },
  };
};
