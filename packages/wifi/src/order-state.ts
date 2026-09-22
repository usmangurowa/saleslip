import type { WifiOrderStatus } from "@turbo/db";

export type { WifiOrderStatus };

/**
 * Order lifecycle. Payment is confirmed only by the Paystack webhook (or the
 * manual verify fallback); the router step may fail and retry any number of
 * times before landing in `fulfilled` or `failed`.
 *
 *   pending ──► paid ──► fulfilled
 *      │          │  ▲
 *      │          ▼  │
 *      │     pending_router ⟲ ──► failed
 *      ▼
 *    failed
 */
export const ORDER_TRANSITIONS: Readonly<
  Record<WifiOrderStatus, readonly WifiOrderStatus[]>
> = {
  pending: ["paid", "failed"],
  paid: ["fulfilled", "pending_router", "failed"],
  // Self-transition records another failed router attempt.
  pending_router: ["pending_router", "fulfilled", "failed"],
  fulfilled: [],
  failed: [],
};

export const canTransition = (
  from: WifiOrderStatus,
  to: WifiOrderStatus,
): boolean => ORDER_TRANSITIONS[from].includes(to);

export class InvalidOrderTransitionError extends Error {
  constructor(
    public readonly from: WifiOrderStatus,
    public readonly to: WifiOrderStatus,
  ) {
    super(`cannot move order from ${from} to ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

export const assertTransition = (
  from: WifiOrderStatus,
  to: WifiOrderStatus,
): void => {
  if (!canTransition(from, to)) throw new InvalidOrderTransitionError(from, to);
};

/** Statuses where the buyer has paid and a voucher is still owed. */
export const isAwaitingRouter = (status: WifiOrderStatus): boolean =>
  status === "paid" || status === "pending_router";

export const isPaid = (status: WifiOrderStatus): boolean =>
  status === "paid" || status === "pending_router" || status === "fulfilled";
