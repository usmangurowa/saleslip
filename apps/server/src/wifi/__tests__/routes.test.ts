import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { PaystackClient } from "@turbo/paystack";

import { createWifiApp } from "../app";
import { fallbackEmail } from "../checkout";
import { phoneSchema } from "../routes/shop";
import { createFakeHotspot, createTestDeps } from "./helpers";

const SECRET = "sk_test_secret";
const sign = (body: string) =>
  createHmac("sha512", SECRET).update(body).digest("hex");

const fakePaystack = (calls: unknown[] = []): PaystackClient => ({
  initializeTransaction: (input) => {
    calls.push(input);
    return Promise.resolve({
      status: "ok",
      data: {
        authorizationUrl: `https://checkout.paystack.test/${input.reference}`,
        accessCode: "ac",
        reference: input.reference,
      },
    });
  },
  verifyTransaction: (reference) =>
    Promise.resolve({
      status: "ok",
      data: { reference, status: "success", amount: 100_000 },
    }),
});

const form = (fields: Record<string, string>) =>
  new Request("http://localhost/orders", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

const jsonBody = (fields: Record<string, unknown>) =>
  new Request("http://localhost/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fields),
  });

describe("phone normalisation", () => {
  it("accepts Nigerian formats and normalises to E.164", () => {
    expect(phoneSchema.parse("0801 234 5678")).toBe("+2348012345678");
    expect(phoneSchema.parse("2348012345678")).toBe("+2348012345678");
    expect(phoneSchema.parse("+2347012345678")).toBe("+2347012345678");
    expect(phoneSchema.safeParse("12345").success).toBe(false);
  });

  it("derives a stable fallback email", () => {
    expect(fallbackEmail("+2348012345678")).toBe(
      "2348012345678@buyers.saleslip.app",
    );
  });
});

describe("shop routes", () => {
  it("renders the plans and carries portal params through the form", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const res = await app.request(
      "/?mac=AA:BB&ip=10.5.50.2&login=http://10.5.50.1/login",
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("1 Day · 1 Device");
    expect(body).toContain('name="mac" value="AA:BB"');
    expect(body).toContain('name="login" value="http://10.5.50.1/login"');
  });

  it("returns 503 when Paystack is not configured", async () => {
    const t = createTestDeps({ paystack: undefined });
    const res = await createWifiApp(t.deps).request("/");
    expect(res.status).toBe(503);
  });

  it("creates an order and redirects to Paystack", async () => {
    const calls: {
      reference: string;
      email: string;
      amount: number;
      metadata?: unknown;
    }[] = [];
    const t = createTestDeps({ paystack: fakePaystack(calls) });
    const app = createWifiApp(t.deps);

    const res = await app.request(
      form({
        planId: "day-1",
        phone: "08012345678",
        mac: "AA:BB",
        login: "http://r/login",
      }),
    );
    expect(res.status).toBe(303);
    const order = [...t.orders.values()][0];
    if (!order) throw new Error("order not created");
    expect(res.headers.get("location")).toBe(
      `https://checkout.paystack.test/${order.id}`,
    );
    expect(order.status).toBe("pending");
    expect(order.phone).toBe("+2348012345678");
    expect(order.loginUrl).toBe("http://r/login");
    expect(calls[0]).toMatchObject({
      reference: order.id,
      email: "2348012345678@buyers.saleslip.app",
      amount: 100_000,
      metadata: { orderId: order.id, planId: "day-1", mac: "AA:BB" },
    });
  });

  it("re-renders the form with an error for a bad phone", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const res = await createWifiApp(t.deps).request(
      form({ planId: "day-1", phone: "123" }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("valid Nigerian phone");
    expect(t.orders.size).toBe(0);
  });

  it("shows a pending receipt, then the code once fulfilled", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({
      paystack: fakePaystack(),
      hotspot: fake.hotspot,
    });
    const app = createWifiApp(t.deps);
    const order = await t.repo.createOrder({
      channel: "web",
      planId: "day-1",
      phone: "+2348012345678",
      amountKobo: 100_000,
      loginUrl: "http://10.5.50.1/login",
    });

    const pending = await app.request(`/orders/${order.id}`);
    expect(pending.status).toBe(200);
    expect(await pending.text()).toContain("Waiting for your payment");
    expect(
      await (await app.request(`/orders/${order.id}/status`)).json(),
    ).toEqual({
      status: "pending",
    });

    await t.fulfilment.handlePayment(order.id, "success");
    const voucher = await t.repo.getVoucherForOrder(order.id);
    if (!voucher) throw new Error("voucher missing");
    const done = await app.request(`/orders/${order.id}`);
    const body = await done.text();
    expect(body).toContain(voucher.code);
    expect(body).toContain("<svg");
    expect(body).toContain('action="http://10.5.50.1/login"');
    expect(body).toContain('name="dst" value="http://neverssl.com"');
    expect(
      await (await app.request(`/orders/${order.id}/status`)).json(),
    ).toEqual({
      status: "fulfilled",
    });
  });

  it("404s unknown orders", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    expect((await createWifiApp(t.deps).request("/orders/nope")).status).toBe(
      404,
    );
    expect(
      (await createWifiApp(t.deps).request("/orders/nope/status")).status,
    ).toBe(404);
  });

  it("creates an order over JSON for the web storefront", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);

    const res = await app.request(
      jsonBody({ planId: "day-1", phone: "08012345678" }),
    );
    expect(res.status).toBe(200);
    const order = [...t.orders.values()][0];
    if (!order) throw new Error("order not created");
    expect(await res.json()).toMatchObject({
      ok: true,
      orderId: order.id,
      authorizationUrl: `https://checkout.paystack.test/${order.id}`,
    });
    expect(order.status).toBe("pending");
    expect(order.phone).toBe("+2348012345678");
  });

  it("returns a JSON validation error for a bad phone", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const res = await createWifiApp(t.deps).request(
      jsonBody({ planId: "day-1", phone: "123" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "validation",
      message: "Enter a valid Nigerian phone number",
    });
    expect(t.orders.size).toBe(0);
  });

  it("returns JSON order detail including the voucher code and QR", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({
      hotspot: fake.hotspot,
      paystack: fakePaystack(),
    });
    const app = createWifiApp(t.deps);
    const order = await t.repo.createOrder({
      channel: "web",
      planId: "day-1",
      phone: "+2348012345678",
      amountKobo: 100_000,
      loginUrl: "http://10.5.50.1/login",
    });

    const pending = await app.request(`/orders/${order.id}`, {
      headers: { accept: "application/json" },
    });
    expect(pending.status).toBe(200);
    expect(await pending.json()).toMatchObject({
      id: order.id,
      status: "pending",
      plan: { id: "day-1", name: "1 Day · 1 Device" },
      amountKobo: 100_000,
      voucherCode: null,
      qrSvg: null,
      loginUrl: "http://10.5.50.1/login",
      supportPhone: "+2348000000000",
    });

    await t.fulfilment.handlePayment(order.id, "success");
    const voucher = await t.repo.getVoucherForOrder(order.id);
    if (!voucher) throw new Error("voucher missing");
    const done = await app.request(`/orders/${order.id}`, {
      headers: { accept: "application/json" },
    });
    const body = (await done.json()) as {
      id: string;
      status: string;
      voucherCode: string | null;
      qrSvg: string | null;
    };
    expect(body).toMatchObject({
      id: order.id,
      status: "fulfilled",
      voucherCode: voucher.code,
    });
    expect(body.qrSvg).toContain("<svg");
  });

  it("includes the bonus code in JSON and the receipt HTML once fulfilled", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({
      hotspot: fake.hotspot,
      paystack: fakePaystack(),
    });
    const app = createWifiApp(t.deps);
    const order = await t.repo.createOrder({
      channel: "web",
      planId: "day-1",
      phone: "+2348012345678",
      amountKobo: 100_000,
    });

    const pending = await app.request(`/orders/${order.id}`, {
      headers: { accept: "application/json" },
    });
    expect(await pending.json()).toMatchObject({ bonusVoucherCode: null });

    await t.fulfilment.handlePayment(order.id, "success");
    const bonus = await t.repo.getBonusVoucherForOrder(order.id);
    if (!bonus) throw new Error("bonus voucher missing");

    const done = await app.request(`/orders/${order.id}`, {
      headers: { accept: "application/json" },
    });
    expect(await done.json()).toMatchObject({
      bonusVoucherCode: bonus.code,
    });

    const html = await (await app.request(`/orders/${order.id}`)).text();
    expect(html).toContain("Bonus code");
    expect(html).toContain(bonus.code);
    expect(html).toContain("data-copy");
    expect(html).toContain("5 free minutes");
  });
});

describe("paystack webhook", () => {
  const post = (body: string, signature?: string) =>
    new Request("http://localhost/webhooks/paystack", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-paystack-signature": signature } : {}),
      },
      body,
    });

  it("rejects missing or bad signatures without touching orders", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({ hotspot: fake.hotspot });
    const app = createWifiApp(t.deps);
    const order = await t.repo.createOrder({
      channel: "web",
      planId: "day-1",
      phone: "+2348012345678",
      amountKobo: 100_000,
    });
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: order.id },
    });

    expect((await app.request(post(body))).status).toBe(401);
    expect((await app.request(post(body, "deadbeef"))).status).toBe(401);
    expect((await t.repo.getOrder(order.id))?.status).toBe("pending");
    expect(fake.calls).toEqual([]);
  });

  it("fulfils on a correctly signed charge.success and is idempotent", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({ hotspot: fake.hotspot });
    const app = createWifiApp(t.deps);
    const order = await t.repo.createOrder({
      channel: "web",
      planId: "day-1",
      phone: "+2348012345678",
      amountKobo: 100_000,
    });
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: order.id, status: "success", amount: 100_000 },
    });

    const first = await app.request(post(body, sign(body)));
    expect(first.status).toBe(200);
    expect(await first.text()).toBe("fulfilled");
    expect((await t.repo.getOrder(order.id))?.status).toBe("fulfilled");

    const second = await app.request(post(body, sign(body)));
    expect(await second.text()).toBe("already_fulfilled");
    // Primary + bonus hotspot users, one pair per order.
    expect(fake.users.size).toBe(2);
  });

  it("acknowledges other events and unknown references with 200", async () => {
    const t = createTestDeps();
    const app = createWifiApp(t.deps);
    const other = JSON.stringify({
      event: "transfer.success",
      data: { reference: "x" },
    });
    expect(await (await app.request(post(other, sign(other)))).text()).toBe(
      "ignored",
    );
    const unknown = JSON.stringify({
      event: "charge.success",
      data: { reference: "x" },
    });
    expect(await (await app.request(post(unknown, sign(unknown)))).text()).toBe(
      "unknown_reference",
    );
  });

  it("manual verify fallback fulfils a paid order", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({
      hotspot: fake.hotspot,
      paystack: fakePaystack(),
    });
    const app = createWifiApp(t.deps);
    const order = await t.repo.createOrder({
      channel: "web",
      planId: "day-1",
      phone: "+2348012345678",
      amountKobo: 100_000,
    });
    const res = await app.request(`/webhooks/paystack/verify/${order.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      outcome: "fulfilled",
      paystackStatus: "success",
    });
  });
});

describe("health", () => {
  it("reports ok when db and router respond", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({ hotspot: fake.hotspot });
    const res = await createWifiApp(t.deps).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok", router: "ok" });
  });

  it("is degraded (still 200) when only the router is down", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new Error("no route");
    const t = createTestDeps({ hotspot: fake.hotspot });
    const res = await createWifiApp(t.deps).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "degraded",
      db: "ok",
      router: "down",
    });
  });

  it("returns 503 when the database is down", async () => {
    const t = createTestDeps({
      pingDb: () => Promise.reject(new Error("ECONNREFUSED")),
    });
    const res = await createWifiApp(t.deps).request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      status: "down",
      db: "down",
      router: "disabled",
    });
  });
});
