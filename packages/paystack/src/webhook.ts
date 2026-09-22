import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Verify Paystack's `x-paystack-signature` header: HMAC-SHA512 of the raw
 * request body keyed with the secret key, hex encoded. Constant-time compare.
 */
export const verifyPaystackSignature = (
  rawBody: string | Uint8Array,
  signature: string | null | undefined,
  secretKey: string,
): boolean => {
  if (!signature || !secretKey) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
};

export const paystackWebhookEventSchema = z.object({
  event: z.string(),
  data: z
    .object({
      reference: z.string(),
      status: z.string().optional(),
      amount: z.number().optional(),
      currency: z.string().optional(),
      channel: z.string().optional(),
      paid_at: z.string().nullable().optional(),
      customer: z
        .object({
          email: z.string().nullable().optional(),
          phone: z.string().nullable().optional(),
        })
        .passthrough()
        .nullable()
        .optional(),
      metadata: z.unknown().optional(),
    })
    .passthrough(),
});

export type PaystackWebhookEvent = z.infer<typeof paystackWebhookEventSchema>;

/** Parse a verified raw body into a typed event; `null` when malformed. */
export const parsePaystackWebhookEvent = (
  rawBody: string,
): PaystackWebhookEvent | null => {
  try {
    const parsed = paystackWebhookEventSchema.safeParse(JSON.parse(rawBody));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
