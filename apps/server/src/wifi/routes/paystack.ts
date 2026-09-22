import { Hono } from "hono";

import {
  parsePaystackWebhookEvent,
  verifyPaystackSignature,
} from "@turbo/paystack";

import type { WifiDeps } from "../deps";

/**
 * Paystack → us. Only this route (and the manual verify fallback) ever moves an
 * order to `paid`; the browser redirect after checkout is never trusted.
 */
export const createPaystackRoutes = (deps: WifiDeps) => {
  const { config, fulfilment, logger } = deps;

  return new Hono()
    .post("/webhooks/paystack", async (c) => {
      if (!config.paystackSecretKey)
        return c.text("paystack not configured", 503);

      const rawBody = await c.req.text();
      const signature = c.req.header("x-paystack-signature");
      if (
        !verifyPaystackSignature(rawBody, signature, config.paystackSecretKey)
      ) {
        logger.warn("paystack webhook rejected: bad signature", {});
        return c.text("invalid signature", 401);
      }

      const event = parsePaystackWebhookEvent(rawBody);
      if (!event) return c.text("malformed event", 400);

      if (event.event !== "charge.success") {
        logger.info("paystack event ignored", { event: event.event });
        return c.text("ignored", 200);
      }

      const result = await fulfilment.handlePayment(
        event.data.reference,
        event.data.status ?? "success",
      );
      logger.info("paystack charge.success handled", {
        reference: event.data.reference,
        outcome: result.outcome,
      });
      // Always 200 once verified: Paystack retries on anything else, and a
      // router outage is our problem to retry, not theirs.
      return c.text(result.outcome, 200);
    })

    .get("/webhooks/paystack/verify/:reference", async (c) => {
      if (!deps.paystack)
        return c.json({ error: "paystack not configured" }, 503);
      const reference = c.req.param("reference");
      const verified = await deps.paystack.verifyTransaction(reference);
      if (verified.status !== "ok") {
        return c.json(
          { reference, error: verified.status, message: verified.message },
          verified.status === "unavailable" ? 502 : 404,
        );
      }
      if (verified.data.status !== "success") {
        return c.json(
          {
            reference,
            paystackStatus: verified.data.status,
            outcome: "not_paid",
          },
          200,
        );
      }
      const result = await fulfilment.handlePayment(
        reference,
        verified.data.status,
      );
      logger.info("manual paystack verify", {
        reference,
        outcome: result.outcome,
      });
      return c.json({
        reference,
        paystackStatus: verified.data.status,
        outcome: result.outcome,
      });
    });
};
