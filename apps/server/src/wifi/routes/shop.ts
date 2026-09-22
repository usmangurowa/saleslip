import { Hono } from "hono";
import QRCode from "qrcode";
import { z } from "zod";

import type { WifiDeps } from "../deps";
import type { PortalParams } from "../pages/buy";
import { startCheckout } from "../checkout";
import { buyPage, unavailablePage } from "../pages/buy";
import { receiptPage } from "../pages/receipt";
import { findPlan } from "../plans";

/** Nigerian mobile numbers: 0XXXXXXXXXX or +234XXXXXXXXXX. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+?234|0)[789][01]\d{8}$/,
        "Enter a valid Nigerian phone number",
      ),
  )
  .transform((value) =>
    value.startsWith("0")
      ? `+234${value.slice(1)}`
      : value.startsWith("+")
        ? value
        : `+${value}`,
  );

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
  phone: phoneSchema,
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.email("Enter a valid email").optional()),
  mac: optionalText(64),
  ip: optionalText(64),
  login: loginUrlSchema,
});

export const portalParamsSchema = z.object({
  mac: optionalText(64),
  ip: optionalText(64),
  login: loginUrlSchema,
});

const firstIssue = (error: z.ZodError) =>
  error.issues[0]?.message ?? "Please check the form and try again";

export const createShopRoutes = (deps: WifiDeps) => {
  const { config, plans, repo } = deps;
  const page = {
    brandName: config.brandName,
    supportPhone: config.supportPhone,
  };

  const renderBuy = (
    portal: PortalParams,
    extra: Partial<Parameters<typeof buyPage>[0]> = {},
  ) => buyPage({ ...page, plans, portal, ...extra });

  return new Hono()
    .get("/", (c) => {
      const parsed = portalParamsSchema.safeParse(c.req.query());
      const portal: PortalParams = parsed.success ? parsed.data : {};
      if (!deps.paystack) {
        return c.html(
          unavailablePage(config.brandName, config.supportPhone),
          503,
        );
      }
      return c.html(renderBuy(portal));
    })

    .post("/orders", async (c) => {
      const body = await c.req.parseBody();
      const parsed = orderFormSchema.safeParse(body);
      const rawPortal = portalParamsSchema.safeParse(body);
      const portal: PortalParams = rawPortal.success ? rawPortal.data : {};

      if (!parsed.success) {
        const values = {
          planId: typeof body.planId === "string" ? body.planId : undefined,
          phone: typeof body.phone === "string" ? body.phone : undefined,
          email: typeof body.email === "string" ? body.email : undefined,
        };
        return c.html(
          renderBuy(portal, { error: firstIssue(parsed.error), values }),
          400,
        );
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

      if (result.ok) return c.redirect(result.authorizationUrl, 303);
      if (result.reason === "unknown_plan") {
        return c.html(
          renderBuy(portal, { error: "That plan is no longer available" }),
          400,
        );
      }
      if (result.reason === "payments_unavailable") {
        return c.html(
          unavailablePage(config.brandName, config.supportPhone),
          503,
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
      const voucher =
        order.status === "fulfilled"
          ? await repo.getVoucherForOrder(order.id)
          : undefined;
      const qrSvg = voucher
        ? await QRCode.toString(voucher.code, {
            type: "svg",
            margin: 1,
            width: 160,
          })
        : undefined;
      c.header("Cache-Control", "no-store");
      return c.html(
        receiptPage({
          ...page,
          order,
          plan: findPlan(plans, order.planId),
          voucher,
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
