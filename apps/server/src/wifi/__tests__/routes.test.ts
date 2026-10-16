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
  it("redirects captive portal GET / to the web storefront preserving query params", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const res = await app.request(
      "/?mac=AA:BB&ip=10.5.50.2&login=http://10.5.50.1/login",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://buy.example.test/buy?mac=AA:BB&ip=10.5.50.2&login=http://10.5.50.1/login",
    );
  });

  it("rejects checkout for a retired plan", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const res = await app.request("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-2" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "unknown_plan",
    });
  });

  it("returns 503 when Paystack is not configured", async () => {
    const t = createTestDeps({ paystack: undefined });
    const app = createWifiApp(t.deps);
    const res = await app.request("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-1" }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "payments_unavailable",
    });
  });

  it("creates an order and returns authorizationUrl over JSON", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const res = await app.request("/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        planId: "day-1",
        phone: "08012345678",
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      authorizationUrl: string;
    };
    expect(json.ok).toBe(true);
    expect(json.authorizationUrl).toContain("https://checkout.paystack.test/");
  });

  it("returns JSON validation error for invalid phone", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const res = await app.request("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: "day-1",
        phone: "invalid-phone",
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "validation",
    });
  });

  it("redirects HTML request for receipt to web receipt page", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const order = await t.repo.createOrder({
      channel: "web",
      planId: "day-1",
      phone: "+2348012345678",
      amountKobo: 100_000,
    });

    const res = await app.request(`/orders/${order.id}`, {
      headers: { accept: "text/html" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `https://buy.example.test/receipt/${order.id}`,
    );
  });

  it("serves order detail as JSON for Next.js receipt page", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const order = await t.repo.createOrder({
      channel: "web",
      planId: "day-1",
      phone: "+2348012345678",
      amountKobo: 100_000,
    });

    const res = await app.request(`/orders/${order.id}`, {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      id: string;
      status: string;
      amountKobo: number;
    };
    expect(data.id).toBe(order.id);
    expect(data.status).toBe("pending");
    expect(data.amountKobo).toBe(100_000);
  });

  it("404s unknown orders for JSON clients", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const res = await app.request("/orders/nonexistent", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(404);

    const statusRes = await app.request("/orders/nonexistent/status");
    expect(statusRes.status).toBe(404);
  });
});

describe("paystack webhook", () => {
  it("rejects missing or bad signatures without touching orders", async () => {
    const t = createTestDeps({ paystack: fakePaystack() });
    const app = createWifiApp(t.deps);
    const res = await app.request("/webhooks/paystack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "charge.success" }),
    });
    expect(res.status).toBe(401);
  });

  it("fulfils on a correctly signed charge.success", async () => {
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
    });

    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: order.id, status: "success", amount: 100_000 },
    });

    const signature = sign(body);
    const res = await app.request("/webhooks/paystack", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paystack-signature": signature,
      },
      body,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("fulfilled");

    const updated = await t.repo.getOrder(order.id);
    expect(updated?.status).toBe("fulfilled");
  });
});

describe("health", () => {
  it("reports ok when db and router respond", async () => {
    const fake = createFakeHotspot();
    const t = createTestDeps({ hotspot: fake.hotspot });
    const app = createWifiApp(t.deps);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok", router: "ok" });
  });
});
