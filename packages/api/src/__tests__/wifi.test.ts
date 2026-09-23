import { describe, expect, it, vi } from "vitest";

import { Hono } from "hono";

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
  (email ? { user: { ...user, email }, session: {} } : null) as unknown as
    AppContext["Variables"]["session"];

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
    state.repo = {
      todaySummary: () =>
        Promise.resolve({ paidOrders: 2, revenueKobo: 60_000 }),
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
      today: { paidOrders: 2, revenueKobo: 60_000 },
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
});
