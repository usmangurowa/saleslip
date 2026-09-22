import { z } from "zod";

const DEFAULT_BASE_URL = "https://api.paystack.co";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;

export type PaystackChannel =
  "card" | "bank" | "ussd" | "qr" | "mobile_money" | "bank_transfer" | "eft";

export interface PaystackConfig {
  secretKey: string;
  baseUrl?: string;
}

export interface InitializeTransactionInput {
  /** Amount in the currency's minor unit (kobo for NGN). */
  amount: number;
  email: string;
  /** Our own unique reference; Paystack echoes it back in the webhook. */
  reference: string;
  callbackUrl?: string;
  channels?: PaystackChannel[];
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializedTransaction {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface VerifiedTransaction {
  reference: string;
  status: string;
  amount: number;
  currency?: string;
  channel?: string;
  paidAt?: string | null;
  customerEmail?: string | null;
  metadata?: unknown;
}

export type PaystackResult<T> =
  | { status: "ok"; data: T }
  | { status: "declined"; message: string }
  | { status: "unavailable"; message: string };

const envelope = z.object({
  status: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

const initializeData = z.object({
  authorization_url: z.string(),
  access_code: z.string(),
  reference: z.string(),
});

const verifyData = z
  .object({
    reference: z.string(),
    status: z.string(),
    amount: z.number(),
    currency: z.string().optional(),
    channel: z.string().optional(),
    paid_at: z.string().nullable().optional(),
    customer: z
      .object({ email: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    metadata: z.unknown().optional(),
  })
  .passthrough();

export interface PaystackClient {
  initializeTransaction(
    input: InitializeTransactionInput,
  ): Promise<PaystackResult<InitializedTransaction>>;
  verifyTransaction(
    reference: string,
  ): Promise<PaystackResult<VerifiedTransaction>>;
}

/**
 * Narrow Paystack adapter: owns the request, timeout, and response parsing.
 * Every transport failure collapses to `{ status: "unavailable" }`; a 4xx
 * from Paystack is `{ status: "declined" }`. Never throws, never logs the key.
 */
export const createPaystackClient = (
  config: PaystackConfig,
): PaystackClient => {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

  const request = async (
    path: string,
    init: { method: "GET" | "POST"; body?: unknown },
  ): Promise<PaystackResult<unknown>> => {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          authorization: `Bearer ${config.secretKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > MAX_BYTES) {
        return { status: "unavailable", message: "response too large" };
      }
      const text = await response.text();
      if (text.length > MAX_BYTES) {
        return { status: "unavailable", message: "response too large" };
      }
      const parsed = envelope.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return { status: "unavailable", message: "malformed response" };
      }
      if (response.status >= 500) {
        return {
          status: "unavailable",
          message: parsed.data.message ?? `HTTP ${response.status}`,
        };
      }
      if (!response.ok || !parsed.data.status) {
        return {
          status: "declined",
          message: parsed.data.message ?? `HTTP ${response.status}`,
        };
      }
      return { status: "ok", data: parsed.data.data };
    } catch (error) {
      return {
        status: "unavailable",
        message: error instanceof Error ? error.message : "request failed",
      };
    }
  };

  return {
    async initializeTransaction(input) {
      const result = await request("/transaction/initialize", {
        method: "POST",
        body: {
          amount: input.amount,
          email: input.email,
          reference: input.reference,
          callback_url: input.callbackUrl,
          channels: input.channels,
          currency: input.currency,
          metadata: input.metadata,
        },
      });
      if (result.status !== "ok") return result;
      const data = initializeData.safeParse(result.data);
      if (!data.success) {
        return { status: "unavailable", message: "malformed initialize data" };
      }
      return {
        status: "ok",
        data: {
          authorizationUrl: data.data.authorization_url,
          accessCode: data.data.access_code,
          reference: data.data.reference,
        },
      };
    },

    async verifyTransaction(reference) {
      const result = await request(
        `/transaction/verify/${encodeURIComponent(reference)}`,
        { method: "GET" },
      );
      if (result.status !== "ok") return result;
      const data = verifyData.safeParse(result.data);
      if (!data.success) {
        return { status: "unavailable", message: "malformed verify data" };
      }
      return {
        status: "ok",
        data: {
          reference: data.data.reference,
          status: data.data.status,
          amount: data.data.amount,
          currency: data.data.currency,
          channel: data.data.channel,
          paidAt: data.data.paid_at ?? null,
          customerEmail: data.data.customer?.email ?? null,
          metadata: data.data.metadata,
        },
      };
    },
  };
};
