import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AppContext, Db } from "../context";
import type * as repositoryModule from "../wifi/repository";

/**
 * The console router works from Postgres alone, so these tests stub the
 * repository and assert the admin gate plus the `/stats` payload shape the
 * dashboard overview renders from.
 */
const state = vi.hoisted(
  (): { repo: Partial<repositoryModule.WifiConsoleRepository> } => ({
    repo: {},
  }),
);

vi.mock("../wifi/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof repositoryModule>();
  return {
    ...actual,
    createWifiConsoleRepository: () =>
      state.repo as repositoryModule.WifiConsoleRepository,
  };
});

const consoleRouter = (await import("../router/wifi")).default;

process.env.ADMIN_EMAILS = "u@example.com";

const user = { id: "u1", email: "u@example.com", name: "U" };

/** Same shape the better-auth session would carry, cast like wifi-router tests. */
const makeSession = (email: string | null) =>
  (email
    ? { user: { ...user, email }, session: {} }
    : null) as unknown as AppContext["Variables"]["session"];

/** Mounts the console router with `session` and `db` injected per request. */
const build = (email: string | null = user.email) => {
  const app = new Hono<AppContext>()
    .use("*", (c, next) => {
      c.set("session", makeSession(email));
      c.set("db", {} as Db);
      return next();
    })
    .route("/", consoleRouter);
  return app;
};

describe("wifi console router", () => {
  it("rejects unauthenticated requests", async () => {
    state.repo = {};
    const res = await build(null).request("/stats");
    expect(res.status).toBe(401);
  });

  it("rejects authenticated non-admins with 403", async () => {
    state.repo = {};
    const res = await build("intruder@example.com").request("/stats");
    expect(res.status).toBe(403);
  });

  it("summarises revenue, orders, vouchers, and generation for /stats", async () => {
    const range = { paidOrders: 2, revenueKobo: 60_000 };
    state.repo = {
      revenueSummary: () =>
        Promise.resolve({ today: range, week: range, month: range, all: range }),
      countOrdersByStatus: () =>
        Promise.resolve({
          pending: 1,
          paid: 2,
          fulfilled: 0,
          pending_router: 0,
          failed: 0,
        }),
      countVouchersByStatus: () => Promise.resolve({ active: 3, revoked: 4 }),
      voucherGenerationSummary: () => Promise.resolve({ total: 7, today: 2 }),
    };
    const res = await build().request("/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      revenue: {
        today: { paidOrders: 2, revenueKobo: 60_000 },
        week: { paidOrders: 2, revenueKobo: 60_000 },
        month: { paidOrders: 2, revenueKobo: 60_000 },
        all: { paidOrders: 2, revenueKobo: 60_000 },
      },
      orders: {
        pending: 1,
        paid: 2,
        fulfilled: 0,
        pending_router: 0,
        failed: 0,
      },
      vouchers: { active: 3, revoked: 4 },
      generated: { total: 7, today: 2 },
    });
  });

  it("lists plans from the DB mapped to the UI shape", async () => {
    state.repo = {
      listPlans: () =>
        Promise.resolve([
          {
            id: "day-1",
            name: "1 Day · 1 Device",
            description: "Unlimited data for 24 hours on one device.",
            priceKobo: 100_000,
            rosProfile: "1-Day-Unlimited",
            validityLabel: "24 hours",
          },
        ]),
    };
    const res = await build().request("/plans");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Record<string, unknown>[];
    };
    expect(body.plans).toEqual([
      {
        id: "day-1",
        name: "1 Day · 1 Device",
        description: "Unlimited data for 24 hours on one device.",
        priceKobo: 100_000,
        rosProfile: "1-Day-Unlimited",
        profile: "1-Day-Unlimited",
        dataLimitBytes: null,
        uptimeLimit: null,
        validityLabel: "24 hours",
      },
    ]);
  });

  it("creates a plan from a validated payload", async () => {
    const created = {
      id: "hour-1",
      name: "1 Hour · 1 Device",
      description: "Unlimited data for one hour.",
      priceKobo: 20_000,
      rosProfile: "1-Hour-Unlimited",
      uptimeLimit: "1 hour",
      validityLabel: "1 hour",
    };
    state.repo = { createPlan: (input) => Promise.resolve(created) };
    const res = await build().request("/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "hour-1",
        name: "1 Hour · 1 Device",
        description: "Unlimited data for one hour.",
        priceKobo: 20_000,
        profile: "1-Hour-Unlimited",
        uptimeLimit: "1 hour",
        validityLabel: "1 hour",
      }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ plan: created });
  });

  it("archives a plan via PATCH", async () => {
    const archived = {
      id: "day-1",
      name: "1 Day · 1 Device",
      description: "Unlimited data for 24 hours on one device.",
      priceKobo: 100_000,
      rosProfile: "1-Day-Unlimited",
      validityLabel: "24 hours",
      active: false,
    };
    state.repo = { updatePlan: vi.fn(() => Promise.resolve(archived)) };
    const res = await build().request("/plans/day-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: archived });
    expect(state.repo.updatePlan).toHaveBeenCalledWith(
      "day-1",
      expect.objectContaining({ active: false }),
    );
  });
});
