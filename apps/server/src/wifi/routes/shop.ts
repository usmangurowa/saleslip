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
import type { PortalParams } from "../pages/buy";
import { startCheckout } from "../checkout";
import { buyPage, unavailablePage } from "../pages/buy";
import { receiptPage } from "../pages/receipt";

/**
 * Nigerian mobile numbers, normalized to E.164. Defined in `@turbo/validators`
 * so the server shop and the web `/buy` form accept the same numbers; re-exported
 * here for existing consumers and tests.
 */
export const phoneSchema = nigerianPhoneSchema;
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/** Only accept MikroTik login URLs on plain http(s); the form POSTs there. */
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

/** Captive-portal query params; `planId` preselects a plan on the buy page. */
export const portalParamsSchema = z.object({
  planId: optionalText(64),
  mac: optionalText(64),
  ip: optionalText(64),
  login: loginUrlSchema,
});

const firstIssue = (error: z.ZodError) =>
  error.issues[0]?.message ?? "Please check the form and try again";

export const createShopRoutes = (deps: WifiDeps) => {
  const { config, repo } = deps;
  const page = {
    brandName: config.brandName,
    supportPhone: config.supportPhone,
  };

  const renderBuy = async (
    portal: PortalParams,
    extra: Partial<Parameters<typeof buyPage>[0]> = {},
  ) =>
    buyPage({ ...page, plans: await deps.plans(), portal, ...extra });

  return new Hono()
    .get("/", async (c) => {
      const parsed = portalParamsSchema.safeParse(c.req.query());
      const portal: PortalParams = parsed.success ? parsed.data : {};
      if (!deps.paystack) {
        return c.html(
          unavailablePage(config.brandName, config.supportPhone),
          503,
        );
      }
      return c.html(await renderBuy(portal));
    })

    .post("/orders", async (c) => {
      const contentType = (c.req.header("content-type") ?? "").toLowerCase();
      const wantsJson = contentType.includes("application/json");

      const body = wantsJson ? await c.req.json() : await c.req.parseBody();
      const parsed = orderFormSchema.safeParse(body);
      const rawPortal = portalParamsSchema.safeParse(body);
      const portal: PortalParams = rawPortal.success ? rawPortal.data : {};

      if (!parsed.success) {
        const message = firstIssue(parsed.error);
        if (wantsJson) {
          return c.json({ ok: false, reason: "validation", message }, 400);
        }
        const values = {
          planId: typeof body.planId === "string" ? body.planId : undefined,
          phone: typeof body.phone === "string" ? body.phone : undefined,
          email: typeof body.email === "string" ? body.email : undefined,
        };
        return c.html(renderBuy(portal, { error: message, values }), 400);
      }

      const result = await startCheckout(deps, {
        channel: "web",
        planId: parsed.data.planId,
        phone: parsed.data.phone,
        email: parsed.data.email,
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
        if (wantsJson) {
          return c.json(
            {
              ok: false,
              reason: "unknown_plan",
              message: "That plan is no longer available",
            },
            400,
          );
        }
        return c.html(
          renderBuy(portal, { error: "That plan is no longer available" }),
          400,
        );
      }
      if (result.reason === "payments_unavailable") {
        if (wantsJson) {
          return c.json(
            {
              ok: false,
              reason: "payments_unavailable",
              message: "Payments are temporarily unavailable",
            },
            503,
          );
        }
        return c.html(
          unavailablePage(config.brandName, config.supportPhone),
          503,
        );
      }
      if (wantsJson) {
        return c.json(
          {
            ok: false,
            reason: "paystack_failed",
            message: "We could not start the payment. Please try again.",
          },
          502,
        );
      }
      return c.html(
        renderBuy(portal, {
          error: "We could not start the payment. Please try again.",
          values: {
            planId: parsed.data.planId,
            phone: parsed.data.phone,
            email: parsed.data.email,
          },
        }),
        502,
      );
    })

    .get("/orders/:id", async (c) => {
      const order = await repo.getOrder(c.req.param("id"));
      if (!order) return c.notFound();
      const plans = await deps.plans();
      const voucher =
        order.status === "fulfilled"
          ? await repo.getVoucherForOrder(order.id)
          : undefined;
      const bonusVoucher =
        order.status === "fulfilled"
          ? await repo.getBonusVoucherForOrder(order.id)
          : undefined;
      const qrSvg = voucher
        ? await QRCode.toString(voucher.code, {
            type: "svg",
            margin: 1,
            width: 160,
          })
        : undefined;
      c.header("Cache-Control", "no-store");

      // The web app's `/receipt/[orderId]` polls this endpoint; it wants the
      // machine-readable order (including the voucher code + QR) rather than the
      // server-rendered HTML receipt used by the captive-portal flow.
      const wantsJson = (c.req.header("accept") ?? "")
        .toLowerCase()
        .includes("application/json");
      if (wantsJson) {
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
          bonusVoucherCode: bonusVoucher?.code ?? null,
          qrSvg: qrSvg ?? null,
          loginUrl: order.loginUrl,
          supportPhone: config.supportPhone ?? null,
          createdAt: order.createdAt.toISOString(),
        });
      }

      return c.html(
        receiptPage({
          ...page,
          order,
          plan: findPlan(plans, order.planId),
          voucher,
          bonusVoucher,
          qrSvg,
          timeZone: config.timeZone,
        }),
      );
    })

    .get("/orders/:id/status", async (c) => {
      const order = await repo.getOrder(c.req.param("id"));
      if (!order) return c.json({ error: "not_found" }, 404);
      c.header("Cache-Control", "no-store");
      return c.json({ status: order.status });
    });
};
