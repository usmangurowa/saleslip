import type { HotspotService } from "@turbo/routeros";
import { isRouterOsUnavailable, RouterOsCommandError } from "@turbo/routeros";

import type { Logger } from "./logger";
import type {
  OrderRepository,
  WifiOrderRecord,
  WifiVoucherRecord,
} from "./orders";
import type { WifiPlan } from "./plans";
import { findPlan, toHotspotUserInput } from "./plans";
import { generateUniqueVoucherCode } from "./voucher-code";

/** Backoff between router attempts, indexed by attempts already made. */
export const RETRY_DELAYS_MS: readonly number[] = [
  5_000,
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
];

export const MAX_ROUTER_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Delay before the next attempt, or `undefined` once the budget is spent. */
export const retryDelayFor = (attempts: number): number | undefined =>
  attempts >= MAX_ROUTER_ATTEMPTS
    ? undefined
    : (RETRY_DELAYS_MS[Math.max(attempts, 1) - 1] ?? RETRY_DELAYS_MS[0]);

export type FulfilmentResult =
  | { outcome: "fulfilled"; order: WifiOrderRecord; voucher: WifiVoucherRecord }
  | {
      outcome: "already_fulfilled";
      order: WifiOrderRecord;
      voucher?: WifiVoucherRecord;
    }
  | { outcome: "pending_router"; order: WifiOrderRecord; retryInMs?: number }
  | { outcome: "failed"; order: WifiOrderRecord; reason: string };

export interface FulfilmentDeps {
  repo: OrderRepository;
  plans: readonly WifiPlan[];
  /** `undefined` when the router is not configured (`ROUTER_DISABLED`). */
  hotspot: HotspotService | undefined;
  hotspotServer?: string;
  logger: Logger;
  onFulfilled?: (
    order: WifiOrderRecord,
    voucher: WifiVoucherRecord,
  ) => Promise<void> | void;
  now?: () => Date;
}

export interface FulfilmentService {
  /** Mark a pending order paid (idempotent) and attempt fulfilment. */
  handlePayment: (
    reference: string,
    paystackStatus: string,
  ) => Promise<FulfilmentResult | { outcome: "unknown_reference" }>;
  /** Attempt (or re-attempt) the router step for a paid order. */
  fulfil: (orderId: string) => Promise<FulfilmentResult>;
  /** Re-queue every paid/pending_router order (called once on boot). */
  sweep: () => Promise<number>;
  /** Cancel pending retry timers (tests / shutdown). */
  stop: () => void;
}

export const createFulfilmentService = (
  deps: FulfilmentDeps,
): FulfilmentService => {
  const now = deps.now ?? (() => new Date());
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Set<string>();

  const schedule = (orderId: string, delayMs: number) => {
    const existing = timers.get(orderId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      timers.delete(orderId);
      void fulfil(orderId).catch((error: unknown) =>
        deps.logger.error("fulfilment retry crashed", { orderId, error }),
      );
    }, delayMs);
    timer.unref();
    timers.set(orderId, timer);
  };

  const ensureVoucher = async (
    order: WifiOrderRecord,
    plan: WifiPlan,
  ): Promise<WifiVoucherRecord> => {
    const existing = await deps.repo.getVoucherForOrder(order.id);
    if (existing) return existing;
    const code = await generateUniqueVoucherCode(deps.repo.voucherCodeExists);
    return deps.repo.createVoucher({
      orderId: order.id,
      code,
      profile: plan.rosProfile,
      limitBytesTotal: plan.dataLimitBytes,
    });
  };

  const fulfil: FulfilmentService["fulfil"] = async (orderId) => {
    if (inFlight.has(orderId)) {
      const order = await deps.repo.getOrder(orderId);
      if (!order) throw new Error(`order ${orderId} not found`);
      return { outcome: "pending_router", order };
    }
    inFlight.add(orderId);
    const log = deps.logger.child({ orderId });
    try {
      const order = await deps.repo.getOrder(orderId);
      if (!order) throw new Error(`order ${orderId} not found`);

      if (order.status === "fulfilled") {
        return {
          outcome: "already_fulfilled",
          order,
          voucher: await deps.repo.getVoucherForOrder(order.id),
        };
      }
      if (order.status !== "paid" && order.status !== "pending_router") {
        return { outcome: "failed", order, reason: `order is ${order.status}` };
      }

      const plan = findPlan(deps.plans, order.planId);
      if (!plan) {
        const failed = await deps.repo.transition(order.id, "failed", {
          lastError: `unknown plan ${order.planId}`,
        });
        log.error("order references unknown plan", { planId: order.planId });
        return { outcome: "failed", order: failed, reason: "unknown plan" };
      }

      const voucher = await ensureVoucher(order, plan);

      if (!deps.hotspot) {
        const pending = await deps.repo.transition(order.id, "pending_router", {
          lastError: "router not configured",
        });
        log.warn("router not configured; order parked", {});
        return { outcome: "pending_router", order: pending };
      }

      try {
        let rosId = voucher.rosId;
        if (!rosId) {
          // A previous attempt may have created the user before we lost the
          // reply, so look it up before adding.
          const existing = await deps.hotspot.findUser(voucher.code);
          if (existing) {
            rosId = existing.id;
          } else {
            const created = await deps.hotspot.createHotspotUser(
              toHotspotUserInput(plan, {
                code: voucher.code,
                orderId: order.id,
                phone: order.phone,
                server: deps.hotspotServer,
              }),
            );
            rosId = created.id;
          }
          if (rosId) await deps.repo.setVoucherRosId(voucher.id, rosId);
        }

        const fulfilled = await deps.repo.transition(order.id, "fulfilled", {
          fulfilledAt: now(),
          lastError: null,
          incrementAttempts: true,
        });
        log.info("order fulfilled", { code: voucher.code, rosId });
        const finalVoucher = { ...voucher, rosId };
        try {
          await deps.onFulfilled?.(fulfilled, finalVoucher);
        } catch (error) {
          log.error("onFulfilled hook failed", { error });
        }
        return {
          outcome: "fulfilled",
          order: fulfilled,
          voucher: finalVoucher,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof RouterOsCommandError) {
          const failed = await deps.repo.transition(order.id, "failed", {
            lastError: message,
            incrementAttempts: true,
          });
          log.error("router rejected hotspot user", { error });
          return { outcome: "failed", order: failed, reason: message };
        }
        const attempts = order.routerAttempts + 1;
        const retryInMs = retryDelayFor(attempts);
        if (retryInMs === undefined) {
          const failed = await deps.repo.transition(order.id, "failed", {
            lastError: `router unreachable after ${attempts} attempts: ${message}`,
            incrementAttempts: true,
          });
          log.error("giving up on router", { attempts, error });
          return { outcome: "failed", order: failed, reason: message };
        }
        const pending = await deps.repo.transition(order.id, "pending_router", {
          lastError: message,
          incrementAttempts: true,
        });
        log.warn("router unavailable; retry scheduled", {
          attempts,
          retryInMs,
          unavailable: isRouterOsUnavailable(error),
          error: message,
        });
        schedule(order.id, retryInMs);
        return { outcome: "pending_router", order: pending, retryInMs };
      }
    } finally {
      inFlight.delete(orderId);
    }
  };

  return {
    fulfil,

    handlePayment: async (reference, paystackStatus) => {
      const order = await deps.repo.findByReference(reference);
      if (!order) return { outcome: "unknown_reference" };
      if (order.status === "pending") {
        await deps.repo.transition(order.id, "paid", {
          paystackStatus,
          paidAt: now(),
        });
        deps.logger.info("order paid", { orderId: order.id, reference });
      }
      return fulfil(order.id);
    },

    sweep: async () => {
      const orders = await deps.repo.listAwaitingRouter();
      for (const order of orders) schedule(order.id, 0);
      if (orders.length > 0)
        deps.logger.info("re-queued orders awaiting router", {
          count: orders.length,
        });
      return orders.length;
    },

    stop: () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
};
