import { describe, expect, it } from "vitest";

import {
  assertTransition,
  canTransition,
  InvalidOrderTransitionError,
  isAwaitingRouter,
  isPaid,
  ORDER_TRANSITIONS,
} from "../order-state";

describe("order state machine", () => {
  it("allows the happy path pending → paid → fulfilled", () => {
    expect(canTransition("pending", "paid")).toBe(true);
    expect(canTransition("paid", "fulfilled")).toBe(true);
  });

  it("parks router failures and lets them retry or resolve", () => {
    expect(canTransition("paid", "pending_router")).toBe(true);
    expect(canTransition("pending_router", "pending_router")).toBe(true);
    expect(canTransition("pending_router", "fulfilled")).toBe(true);
    expect(canTransition("pending_router", "failed")).toBe(true);
  });

  it("never fulfils an unpaid order", () => {
    expect(canTransition("pending", "fulfilled")).toBe(false);
    expect(canTransition("pending", "pending_router")).toBe(false);
  });

  it("treats fulfilled and failed as terminal", () => {
    expect(ORDER_TRANSITIONS.fulfilled).toEqual([]);
    expect(ORDER_TRANSITIONS.failed).toEqual([]);
    expect(canTransition("fulfilled", "paid")).toBe(false);
    expect(canTransition("failed", "pending")).toBe(false);
  });

  it("assertTransition throws a typed error", () => {
    expect(() => assertTransition("fulfilled", "paid")).toThrow(
      InvalidOrderTransitionError,
    );
    expect(() => assertTransition("pending", "paid")).not.toThrow();
  });

  it("classifies statuses", () => {
    expect(isAwaitingRouter("paid")).toBe(true);
    expect(isAwaitingRouter("pending_router")).toBe(true);
    expect(isAwaitingRouter("pending")).toBe(false);
    expect(isPaid("fulfilled")).toBe(true);
    expect(isPaid("pending")).toBe(false);
  });
});
