import type { WifiDeps } from "./deps";
import type { CreateOrderInput, WifiOrderRecord } from "./orders";
import type { WifiPlan } from "./plans";
import { findPlan } from "./plans";

export const PAYSTACK_CHANNELS = ["bank_transfer", "ussd", "card"] as const;

/** Paystack requires an email; hotspot buyers usually only have a phone. */
export const fallbackEmail = (phone: string) =>
  `${phone.replace(/\D/g, "")}@guilders.wifi`;

export type CheckoutResult =
  | {
      ok: true;
      order: WifiOrderRecord;
      plan: WifiPlan;
      authorizationUrl: string;
    }
  | { ok: false; reason: "unknown_plan" }
  | { ok: false; reason: "payments_unavailable" }
  | {
      ok: false;
      reason: "paystack_failed";
      order: WifiOrderRecord;
      message: string;
    };

/**
 * Creates a pending order and a Paystack transaction for it. Shared by the
 * web form and the Telegram bot so both channels behave identically; the
 * order is only ever fulfilled by the webhook, never by the redirect.
 */
export const startCheckout = async (
  deps: WifiDeps,
  input: Omit<CreateOrderInput, "amountKobo">,
): Promise<CheckoutResult> => {
  const { config, repo, logger } = deps;
  const plan = findPlan(deps.plans, input.planId);
  if (!plan) return { ok: false, reason: "unknown_plan" };
  if (!deps.paystack || !config.publicBaseUrl) {
    return { ok: false, reason: "payments_unavailable" };
  }

  const order = await repo.createOrder({
    ...input,
    amountKobo: plan.priceKobo,
  });

  const init = await deps.paystack.initializeTransaction({
    amount: order.amountKobo,
    email: order.email ?? fallbackEmail(order.phone),
    reference: order.paystackReference,
    callbackUrl: `${config.publicBaseUrl}/orders/${order.id}`,
    channels: [...PAYSTACK_CHANNELS],
    metadata: {
      orderId: order.id,
      planId: plan.id,
      phone: order.phone,
      mac: order.mac,
      ip: order.ip,
      channel: order.channel,
    },
  });

  if (init.status !== "ok") {
    logger.error("paystack initialize failed", {
      orderId: order.id,
      status: init.status,
      message: init.message,
    });
    const failed = await repo.transition(order.id, "failed", {
      lastError: `paystack initialize: ${init.message}`,
    });
    return {
      ok: false,
      reason: "paystack_failed",
      order: failed,
      message: init.message,
    };
  }

  logger.info("order created", {
    orderId: order.id,
    planId: plan.id,
    channel: order.channel,
  });
  return {
    ok: true,
    order,
    plan,
    authorizationUrl: init.data.authorizationUrl,
  };
};
