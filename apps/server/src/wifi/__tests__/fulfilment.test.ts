import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RouterOsCommandError,
  RouterOsUnavailableError,
} from "@turbo/routeros";

import {
  MAX_ROUTER_ATTEMPTS,
  RETRY_DELAYS_MS,
  retryDelayFor,
} from "../fulfilment";
import { createFakeHotspot, createTestDeps } from "./helpers";

const newPaidOrder = async (
  t: ReturnType<typeof createTestDeps>,
  planId = "daily-1gb",
) => {
  const order = await t.repo.createOrder({
    channel: "web",
    planId,
    phone: "+2348012345678",
    amountKobo: 30_000,
  });
  return order;
};

describe("retryDelayFor", () => {
  it("walks the backoff ladder then gives up", () => {
    expect(retryDelayFor(1)).toBe(RETRY_DELAYS_MS[0]);
    expect(retryDelayFor(RETRY_DELAYS_MS.length)).toBe(RETRY_DELAYS_MS.at(-1));
    expect(retryDelayFor(MAX_ROUTER_ATTEMPTS)).toBeUndefined();
  });
});

describe("fulfilment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks paid, creates the hotspot user and fulfils on charge.success", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({ hotspot: fake.hotspot });
    const order = await newPaidOrder(t);

    const result = await t.fulfilment.handlePayment(
      order.paystackReference,
      "success",
    );
    expect(result.outcome).toBe("fulfilled");
    if (result.outcome !== "fulfilled") throw new Error("unreachable");

    expect(result.order.status).toBe("fulfilled");
    expect(result.order.paidAt).not.toBeNull();
    expect(result.voucher.code).toMatch(/^GW[A-Z2-9]{5}$/);
    expect(result.voucher.rosId).toBe("*1");

    const user = fake.users.get(result.voucher.code);
    expect(user?.profile).toBe("Daily-1GB");
    expect(user?.comment).toBe(`saleslip|${order.id}|+2348012345678`);
    expect(user?.limitBytesTotal).toBe(1024 ** 3);
    expect(t.fulfilled).toHaveLength(1);
  });

  it("is idempotent for duplicate webhooks", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({ hotspot: fake.hotspot });
    const order = await newPaidOrder(t);

    await t.fulfilment.handlePayment(order.paystackReference, "success");
    const again = await t.fulfilment.handlePayment(
      order.paystackReference,
      "success",
    );
    expect(again.outcome).toBe("already_fulfilled");
    expect(fake.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
    expect(t.fulfilled).toHaveLength(1);
  });

  it("reports unknown references without side effects", async () => {
    const t = createTestDeps();
    expect(await t.fulfilment.handlePayment("nope", "success")).toEqual({
      outcome: "unknown_reference",
    });
  });

  it("parks the order when the router is unreachable and retries with backoff", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsUnavailableError("tunnel down");
    const t = createTestDeps({ hotspot: fake.hotspot });
    const order = await newPaidOrder(t);

    const result = await t.fulfilment.handlePayment(
      order.paystackReference,
      "success",
    );
    expect(result.outcome).toBe("pending_router");
    if (result.outcome !== "pending_router") throw new Error("unreachable");
    expect(result.retryInMs).toBe(RETRY_DELAYS_MS[0]);
    expect(result.order.routerAttempts).toBe(1);
    expect(result.order.lastError).toContain("tunnel down");

    // Voucher code is already reserved so the retry reuses it.
    const voucher = await t.repo.getVoucherForOrder(order.id);
    expect(voucher).toBeDefined();

    fake.state.fail = undefined;
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] ?? 0);

    const after = await t.repo.getOrder(order.id);
    expect(after?.status).toBe("fulfilled");
    expect(fake.users.has(voucher?.code ?? "")).toBe(true);
    t.fulfilment.stop();
  });

  it("fails permanently once the retry budget is spent", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsUnavailableError("down");
    const t = createTestDeps({ hotspot: fake.hotspot });
    const order = await newPaidOrder(t);

    await t.fulfilment.handlePayment(order.paystackReference, "success");
    for (const delay of RETRY_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay);
    }
    const after = await t.repo.getOrder(order.id);
    expect(after?.status).toBe("failed");
    expect(after?.routerAttempts).toBe(MAX_ROUTER_ATTEMPTS);
    t.fulfilment.stop();
  });

  it("fails fast on a RouterOS command error (bad profile etc.)", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsCommandError(
      "/ip/hotspot/user/add",
      "input does not match any value of profile",
    );
    const t = createTestDeps({ hotspot: fake.hotspot });
    const order = await newPaidOrder(t);

    const result = await t.fulfilment.handlePayment(
      order.paystackReference,
      "success",
    );
    expect(result.outcome).toBe("failed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("adopts an existing hotspot user instead of creating a duplicate", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({ hotspot: fake.hotspot });
    const order = await newPaidOrder(t);
    await t.repo.transition(order.id, "paid", { paidAt: new Date() });
    const voucher = await t.repo.createVoucher({
      orderId: order.id,
      code: "GWABCDE",
      profile: "Daily-1GB",
      channel: "web",
    });
    await fake.hotspot.createHotspotUser({
      name: voucher.code,
      password: voucher.code,
      profile: "Daily-1GB",
    });
    fake.calls.length = 0;

    const result = await t.fulfilment.fulfil(order.id);
    expect(result.outcome).toBe("fulfilled");
    expect(fake.calls).toEqual([`find:${voucher.code}`]);
  });

  it("parks orders when no router is configured and sweeps them later", async () => {
    const t = createTestDeps({ hotspot: undefined });
    const order = await newPaidOrder(t);
    const result = await t.fulfilment.handlePayment(
      order.paystackReference,
      "success",
    );
    expect(result.outcome).toBe("pending_router");
    expect((await t.repo.listAwaitingRouter()).map((o) => o.id)).toEqual([
      order.id,
    ]);
  });

  it("fails orders whose plan no longer exists", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({ hotspot: fake.hotspot });
    const order = await newPaidOrder(t, "gone");
    const result = await t.fulfilment.handlePayment(
      order.paystackReference,
      "success",
    );
    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") expect(result.reason).toBe("unknown plan");
  });
});
