import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { parsePaystackWebhookEvent, verifyPaystackSignature } from "../webhook";

const secret = "sk_test_example";
const body = JSON.stringify({
  event: "charge.success",
  data: { reference: "order-1", status: "success", amount: 50000 },
});
const sign = (payload: string, key = secret) =>
  createHmac("sha512", key).update(payload).digest("hex");

describe("verifyPaystackSignature", () => {
  it("accepts a valid signature", () => {
    expect(verifyPaystackSignature(body, sign(body), secret)).toBe(true);
  });

  it("accepts a raw byte body", () => {
    expect(verifyPaystackSignature(Buffer.from(body), sign(body), secret)).toBe(
      true,
    );
  });

  it("rejects a signature for a different body", () => {
    expect(verifyPaystackSignature(body + " ", sign(body), secret)).toBe(false);
  });

  it("rejects a signature made with another key", () => {
    expect(verifyPaystackSignature(body, sign(body, "other"), secret)).toBe(
      false,
    );
  });

  it("rejects a missing, empty, or malformed header", () => {
    expect(verifyPaystackSignature(body, null, secret)).toBe(false);
    expect(verifyPaystackSignature(body, "", secret)).toBe(false);
    expect(verifyPaystackSignature(body, "not-hex", secret)).toBe(false);
    expect(verifyPaystackSignature(body, sign(body), "")).toBe(false);
  });
});

describe("parsePaystackWebhookEvent", () => {
  it("parses a charge.success event", () => {
    expect(parsePaystackWebhookEvent(body)).toMatchObject({
      event: "charge.success",
      data: { reference: "order-1", status: "success", amount: 50000 },
    });
  });

  it("returns null for invalid JSON or a missing reference", () => {
    expect(parsePaystackWebhookEvent("{")).toBeNull();
    expect(
      parsePaystackWebhookEvent(JSON.stringify({ event: "x", data: {} })),
    ).toBeNull();
  });
});
