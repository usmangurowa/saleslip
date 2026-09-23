import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { WIFI_ORDER_STATUSES, WIFI_VOUCHER_STATUSES } from "@turbo/db/schema";

import type { AppContext } from "../context";
import { adminMiddleware } from "../middleware/auth";
import { resolvePlans } from "../wifi/plans";
import { createWifiConsoleRepository } from "../wifi/repository";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const paginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

const listOrdersSchema = paginationSchema.extend({
  status: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").filter(Boolean) : []))
    .pipe(z.array(z.enum(WIFI_ORDER_STATUSES))),
});

const listVouchersSchema = paginationSchema.extend({
  status: z.enum(WIFI_VOUCHER_STATUSES).optional(),
  batchId: z.string().min(1).optional(),
});

/**
 * Read-only console surface: everything here works from Postgres alone, so it
 * is safe to mount on the Next app as well as on `apps/server`.
 *
 * Anything that touches the router — minting, revoking, live sessions — lives
 * in `wifi-router.ts`, which is only mounted where a hotspot is reachable.
 */
const app = new Hono<AppContext>()
  // Every WiFi route exposes customer phone numbers and revenue figures.
  .use("*", adminMiddleware)
  .get("/plans", (c) => {
    const plans = resolvePlans();
    return c.json({
      plans: plans.map((plan) => ({
        ...plan,
        // The UI speaks `profile`; the domain model keeps the RouterOS name.
        profile: plan.rosProfile,
        dataLimitBytes: plan.dataLimitBytes ?? null,
      })),
    });
  })
  .get("/orders", zValidator("query", listOrdersSchema), async (c) => {
    const { status, limit, offset } = c.req.valid("query");
    const repo = createWifiConsoleRepository(c.get("db"));
    const page = await repo.listOrders({
      status: status.length ? status : undefined,
      limit,
      offset,
    });
    return c.json(page);
  })
  .get("/vouchers", zValidator("query", listVouchersSchema), async (c) => {
    const { status, batchId, limit, offset } = c.req.valid("query");
    const repo = createWifiConsoleRepository(c.get("db"));
    const page = await repo.listVouchers({ status, batchId, limit, offset });
    return c.json(page);
  })
  .get("/batches", async (c) => {
    const repo = createWifiConsoleRepository(c.get("db"));
    return c.json({ batches: await repo.listBatches(DEFAULT_PAGE_SIZE) });
  })
  .get("/stats", async (c) => {
    const repo = createWifiConsoleRepository(c.get("db"));
    const [today, orders, vouchers, generated] = await Promise.all([
      repo.todaySummary(),
      repo.countOrdersByStatus(),
      repo.countVouchersByStatus(),
      repo.voucherGenerationSummary(),
    ]);
    return c.json({ today, orders, vouchers, generated });
  });

export default app;
