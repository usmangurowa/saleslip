import { afterEach, describe, expect, it, vi } from "vitest";

import { createPaystackClient } from "../client";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createPaystackClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes a transaction and maps the response", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          status: true,
          message: "Authorization URL created",
          data: {
            authorization_url: "https://checkout.paystack.com/abc",
            access_code: "abc",
            reference: "order-1",
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPaystackClient({ secretKey: "sk_test_x" });
    const result = await client.initializeTransaction({
      amount: 50000,
      email: "08012345678@saleslip.wifi",
      reference: "order-1",
      callbackUrl: "https://buy.example/orders/order-1",
      channels: ["bank_transfer", "ussd", "card"],
      metadata: { orderId: "order-1" },
    });

    expect(result).toEqual({
      status: "ok",
      data: {
        authorizationUrl: "https://checkout.paystack.com/abc",
        accessCode: "abc",
        reference: "order-1",
      },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk_test_x",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      amount: 50000,
      reference: "order-1",
      channels: ["bank_transfer", "ussd", "card"],
    });
  });

  it("returns declined for a 4xx envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(400, { status: false, message: "Invalid amount" }),
        ),
      ),
    );
    const client = createPaystackClient({ secretKey: "sk" });
    await expect(
      client.initializeTransaction({ amount: 0, email: "a@b", reference: "r" }),
    ).resolves.toEqual({ status: "declined", message: "Invalid amount" });
  });

  it("returns unavailable on network error, 5xx and malformed body", async () => {
    const client = createPaystackClient({ secretKey: "sk" });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNRESET"))),
    );
    await expect(client.verifyTransaction("r")).resolves.toMatchObject({
      status: "unavailable",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse(502, { status: false, message: "bad" })),
      ),
    );
    await expect(client.verifyTransaction("r")).resolves.toMatchObject({
      status: "unavailable",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("<html>"))),
    );
    await expect(client.verifyTransaction("r")).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("verifies a transaction and encodes the reference", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          status: true,
          data: {
            reference: "order 1",
            status: "success",
            amount: 30000,
            currency: "NGN",
            channel: "bank_transfer",
            paid_at: "2026-01-01T00:00:00.000Z",
            customer: { email: "x@y" },
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createPaystackClient({ secretKey: "sk" });
    await expect(client.verifyTransaction("order 1")).resolves.toEqual({
      status: "ok",
      data: {
        reference: "order 1",
        status: "success",
        amount: 30000,
        currency: "NGN",
        channel: "bank_transfer",
        paidAt: "2026-01-01T00:00:00.000Z",
        customerEmail: "x@y",
        metadata: undefined,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction/verify/order%201",
      expect.anything(),
    );
  });
});
