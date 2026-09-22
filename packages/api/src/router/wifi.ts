import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { WIFI_ORDER_STATUSES, WIFI_VOUCHER_STATUSES } from "@turbo/db/schema";
import {
  buildPlans,
  findPlan,
  InvalidBatchQuantityError,
  MAX_BATCH_QUANTITY,
} from "@turbo/wifi";

import type { AppContext } from "../context";
import { authMiddleware } from "../middleware/auth";
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

const batchSchema = z.object({
  planId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_BATCH_QUANTITY),
  label: z.string().trim().min(1).max(120),
});

/**
 * Plan catalogue for the console.
 *
 * Profile names must match the Mikhmon-created RouterOS profiles, so the web
 * runtime reads the same `WIFI_PROFILE_*` variables `apps/server` does. Reading
 * `process.env` directly matches how this package already handles optional env
 * (`router/support.ts`) and avoids threading config through `createApp`.
 */
const resolvePlans = () =>
  buildPlans({
    dailyUnlimited: process.env.WIFI_PROFILE_DAILY_UNLIMITED,
    daily1gb: process.env.WIFI_PROFILE_DAILY_1GB,
    weekly5gb: process.env.WIFI_PROFILE_WEEKLY_5GB,
  });

const app = new Hono<AppContext>()
  // Every WiFi route exposes customer phone numbers and revenue figures.
  .use("*", authMiddleware)
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
    const [today, orders, vouchers] = await Promise.all([
      repo.todaySummary(),
      repo.countOrdersByStatus(),
      repo.countVouchersByStatus(),
    ]);
    return c.json({ today, orders, vouchers });
  })
  .post("/vouchers/batch", zValidator("json", batchSchema), async (c) => {
    const session = c.get("session");
    if (!session?.user) return c.json({ error: "Unauthorized" }, 401);

    const { planId, quantity, label } = c.req.valid("json");
    const plan = findPlan(resolvePlans(), planId);
    if (!plan) return c.json({ error: "Unknown plan" }, 404);

    const repo = createWifiConsoleRepository(c.get("db"));
    try {
      const result = await repo.createVoucherBatch({
        label,
        plan,
        quantity,
        createdBy: session.user.id,
        channel: "manual",
      });
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof InvalidBatchQuantityError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  })
  .post("/vouchers/:id/revoke", async (c) => {
    const repo = createWifiConsoleRepository(c.get("db"));
    const voucher = await repo.revokeVoucher(c.req.param("id"));
    if (!voucher) return c.json({ error: "Voucher not found" }, 404);
    return c.json({ voucher });
  });

export default app;
