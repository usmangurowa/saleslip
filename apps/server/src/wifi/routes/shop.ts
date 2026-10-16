import { Hono } from "hono";
import QRCode from "qrcode";
import { z } from "zod";

import {
  nigerianPhoneSchema,
  optionalEmailSchema,
  optionalNigerianPhoneSchema,
} from "@turbo/validators";
import { findPlan } from "@turbo/wifi";

import type { WifiDeps } from "../deps";
import { startCheckout } from "../checkout";

export const phoneSchema = nigerianPhoneSchema;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

const loginUrlSchema = optionalText(2048).refine(
  (value) => value === undefined || /^https?:\/\//i.test(value),
  "Invalid login URL",
);

export const orderFormSchema = z.object({
  planId: z.string().trim().min(1, "Choose a plan"),
  email: optionalEmailSchema,
  phone: optionalNigerianPhoneSchema,
  mac: optionalText(64),
  ip: optionalText(64),
  login: loginUrlSchema,
});

export const portalParamsSchema = z.object({
  planId: optionalText(64),
  mac: optionalText(64),
  ip: optionalText(64),
  login: loginUrlSchema,
});

const firstIssue = (error: z.ZodError) =>
  error.issues[0]?.message ?? "Please check the form and try again";

const resolveStorefrontBaseUrl = (deps: WifiDeps): string =>
  deps.config.webBaseUrl ?? deps.config.publicBaseUrl ?? "";

export const createShopRoutes = (deps: WifiDeps): Hono => {
  const app = new Hono();

  // Captive portal entry point: redirect to the Next.js `/buy` storefront
  // preserving MikroTik hotspot parameters (`?mac=...&ip=...&login=...`).
  app.get("/", (c) => {
    const url = new URL(c.req.url);
    const base = resolveStorefrontBaseUrl(deps);
    return c.redirect(`${base}/buy${url.search}`, 302);
  });

  app.post("/orders", async (c) => {
    const contentType = (c.req.header("content-type") ?? "").toLowerCase();
    const wantsJson = contentType.includes("application/json");

    const body = wantsJson ? await c.req.json() : await c.req.parseBody();
    const parsed = orderFormSchema.safeParse(body);

    if (!parsed.success) {
      const message = firstIssue(parsed.error);
      if (wantsJson) {
        return c.json({ ok: false, reason: "validation", message }, 400);
      }
      return c.json({ error: message }, 400);
    }

    const result = await startCheckout(deps, {
      planId: parsed.data.planId,
      channel: "web",
      email: parsed.data.email,
      phone: parsed.data.phone,
      mac: parsed.data.mac,
      ip: parsed.data.ip,
      loginUrl: parsed.data.login,
    });

    if (result.ok) {
      if (wantsJson) {
        return c.json({
          ok: true,
          orderId: result.order.id,
          authorizationUrl: result.authorizationUrl,
        });
      }
      return c.redirect(result.authorizationUrl, 303);
    }

    if (result.reason === "unknown_plan") {
      return c.json(
        {
          ok: false,
          reason: "unknown_plan",
          message: "That plan is no longer available",
        },
        400,
      );
    }

    if (result.reason === "payments_unavailable") {
      return c.json(
        {
          ok: false,
          reason: "payments_unavailable",
          message: "Payments are temporarily unavailable",
        },
        503,
      );
    }

    return c.json(
      {
        ok: false,
        reason: "paystack_failed",
        message: "We could not start the payment. Please try again.",
      },
      502,
    );
  });

  app.get("/orders/:id", async (c) => {
    const accept = (c.req.header("accept") ?? "").toLowerCase();
    const wantsJson = accept.includes("application/json");

    if (!wantsJson) {
      const base = resolveStorefrontBaseUrl(deps);
      return c.redirect(`${base}/receipt/${c.req.param("id")}`, 302);
    }

    const order = await deps.repo.getOrder(c.req.param("id"));
    if (!order) return c.notFound();

    const plans = await deps.plans();
    const voucher =
      order.status === "fulfilled"
        ? await deps.repo.getVoucherForOrder(order.id)
        : undefined;
    const qrSvg = voucher
      ? await QRCode.toString(voucher.code, {
          type: "svg",
          margin: 1,
          width: 160,
        })
      : null;
    c.header("Cache-Control", "no-store");

    const plan = findPlan(plans, order.planId);
    return c.json({
      id: order.id,
      status: order.status,
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            validityLabel: plan.validityLabel,
            dataLimitBytes: plan.dataLimitBytes ?? null,
          }
        : null,
      amountKobo: order.amountKobo,
      voucherCode: voucher?.code ?? null,
      qrSvg: qrSvg ?? null,
      loginUrl: order.loginUrl,
      supportPhone: deps.config.supportPhone ?? null,
      createdAt: order.createdAt.toISOString(),
    });
  });

  app.get("/orders/:id/status", async (c) => {
    const order = await deps.repo.getOrder(c.req.param("id"));
    if (!order) return c.json({ error: "not_found" }, 404);
    c.header("Cache-Control", "no-store");
    return c.json({ status: order.status });
  });

  return app;
};
