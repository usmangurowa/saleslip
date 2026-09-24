import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import type { HotspotService } from "@turbo/routeros";
import { isRouterOsUnavailable } from "@turbo/routeros";
import {
  findPlan,
  InvalidBatchQuantityError,
  MAX_BATCH_QUANTITY,
  toHotspotUserInput,
} from "@turbo/wifi";

import type { AppContext, AuthWithApi, Db } from "../context";
import { adminMiddleware } from "../middleware/auth";
import { contextMiddleware } from "../middleware/context";
import { secureHeadersMiddleware } from "../middleware/security";
import {
  VoucherActivationError,
  VoucherActivationUnavailableError,
} from "../wifi/activation-errors";
import { resolveHotspotServer, resolvePlans } from "../wifi/plans";
import {
  activateVoucherOnRouter,
  createWifiConsoleRepository,
} from "../wifi/repository";

const batchSchema = z.object({
  planId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_BATCH_QUANTITY),
  label: z.string().trim().min(1).max(120).optional(),
});

/**
 * Fallback label for batches minted without one: a sortable UTC stamp, so a
 * stack of printed sheets orders itself chronologically.
 */
const defaultBatchLabel = (at: Date) =>
  `${at.toISOString().slice(0, 10)} ${at.toISOString().slice(11, 16)} UTC`;

const activateSchema = z.object({ planId: z.string().min(1) });

type WifiRouterContext = Context<AppContext>;

/**
 * Router-backed console surface.
 *
 * Kept out of `createApp` on purpose. `createApp` is mounted by *both* the Next
 * app and `apps/server`, and only `apps/server` has a WireGuard route to the
 * hotspot; adding these routes there would advertise endpoints one host cannot
 * serve. Instead `apps/server` mounts this app at `/wifi-router` when a
 * `HotspotService` exists, and the web console reaches it through the
 * same-origin proxy at `apps/web/src/app/api/wifi-router/[...path]/route.ts`
 * (the browser-facing prefix is `/api/wifi-router`).
 */
export interface WifiRouterAppOptions {
  /** Auth instance, for the session lookup. */
  auth: AuthWithApi;
  db: Db;
  /** `undefined` when the router is not configured; every route then 503s. */
  hotspot?: HotspotService;
  /** Hotspot server name for routers running more than one. */
  hotspotServer?: string;
  now?: () => Date;
}

export const createWifiRouterApp = ({
  auth,
  db,
  hotspot,
  hotspotServer = resolveHotspotServer(),
  now,
}: WifiRouterAppOptions) => {
  const clock = now ?? (() => new Date());

  /**
   * Wraps a handler that needs a live router. Collapses "no router configured"
   * and "router unreachable" into one 503 — from the console both mean "try
   * again later" — and maps the activation errors onto status codes so routes
   * never see the RouterOS taxonomy.
   *
   * The handler's response type flows through untouched (hence the generic),
   * so the client still infers each route's payload.
   */
  const withRouter =
    <T extends Response>(
      handler: (service: HotspotService, c: WifiRouterContext) => Promise<T>,
    ) =>
    async (c: WifiRouterContext) => {
      if (!hotspot) {
        return c.json({ error: "Router integration is not configured" }, 503);
      }
      try {
        return await handler(hotspot, c);
      } catch (error) {
        if (error instanceof VoucherActivationError) {
          return c.json({ error: error.message }, 422);
        }
        if (
          error instanceof VoucherActivationUnavailableError ||
          isRouterOsUnavailable(error)
        ) {
          return c.json(
            {
              error:
                error instanceof Error ? error.message : "Router unreachable",
            },
            503,
          );
        }
        throw error;
      }
    };

  return (
    new Hono<AppContext>()
      // Self-contained: `createApp` is not mounted here, so this app brings its
      // own context and headers.
      .use("*", secureHeadersMiddleware())
      .use("*", contextMiddleware(auth, db))
      // Every route below exposes phone numbers, revenue, or router access.
      .use("*", adminMiddleware)
      .get(
        "/health",
        withRouter(async (service, c) => {
          try {
            return c.json({
              reachable: true,
              error: null,
              resource: await service.systemResource(),
            });
          } catch (error) {
            // A down router is a state the console renders, not a server error.
            return c.json({
              reachable: false,
              error: error instanceof Error ? error.message : String(error),
              resource: null,
            });
          }
        }),
      )
      .get(
        "/profiles",
        withRouter(async (service, c) =>
          c.json({ profiles: await service.listProfiles() }),
        ),
      )
      .get(
        "/sessions",
        withRouter(async (service, c) => {
          const repo = createWifiConsoleRepository(c.get("db"));
          const plans = resolvePlans();
          const sessions = await service.listActive();
          const vouchers = await repo.findVouchersByCodes(
            sessions.map((session) => session.user),
          );
          const today = await repo.todaySummary();

          return c.json({
            sessions: sessions.map((session) => {
              const voucher = vouchers.get(session.user);
              const plan = voucher
                ? plans.find(
                    (candidate) => candidate.rosProfile === voucher.profile,
                  )
                : undefined;
              return {
                id: session.id,
                user: session.user,
                address: session.address ?? null,
                macAddress: session.macAddress ?? null,
                uptime: session.uptime ?? null,
                bytesIn: session.bytesIn ?? 0,
                bytesOut: session.bytesOut ?? 0,
                planName: plan?.name ?? null,
                phone: voucher?.phone ?? null,
                amountKobo: voucher?.amountKobo ?? null,
                activatedAt: voucher?.activatedAt?.toISOString() ?? null,
                known: voucher !== undefined,
              };
            }),
            live: sessions.length,
            revenueKoboToday: today.revenueKobo,
          });
        }),
      )
      .post(
        "/sessions/sync",
        withRouter(async (service, c) => {
          const repo = createWifiConsoleRepository(c.get("db"));
          const syncedAt = clock();
          const users = await service.listUsers();
          const usage = new Map(
            users
              .filter((user) => user.name !== "")
              .map((user) => [
                user.name,
                {
                  bytesUsed: (user.bytesIn ?? 0) + (user.bytesOut ?? 0),
                  syncedAt,
                },
              ]),
          );
          const synced = await repo.recordUsage(usage);
          return c.json({ synced, syncedAt: syncedAt.toISOString() });
        }),
      )
      .post(
        "/sessions/:user/kick",
        withRouter(async (service, c) => {
          const user = c.req.param("user");
          if (!user) return c.json({ error: "Missing user" }, 400);
          const kicked = await service.kick(user);
          return c.json({ kicked });
        }),
      )
      .post("/vouchers/batch", zValidator("json", batchSchema), async (c) => {
        const session = c.get("session");
        if (!session?.user) return c.json({ error: "Unauthorized" }, 401);
        if (!hotspot) {
          return c.json({ error: "Router integration is not configured" }, 503);
        }

        const { planId, quantity, label } = c.req.valid("json");
        const plan = findPlan(resolvePlans(), planId);
        if (!plan) return c.json({ error: "Unknown plan" }, 404);

        const repo = createWifiConsoleRepository(c.get("db"));
        try {
          const result = await repo.createVoucherBatch({
            label: label ?? defaultBatchLabel(clock()),
            plan,
            quantity,
            createdBy: session.user.id,
            channel: "manual",
            hotspot,
            hotspotServer,
            now,
          });
          return c.json(result, 201);
        } catch (error) {
          if (error instanceof InvalidBatchQuantityError) {
            return c.json({ error: error.message }, 400);
          }
          if (error instanceof VoucherActivationError) {
            return c.json({ error: error.message, code: error.code }, 422);
          }
          if (error instanceof VoucherActivationUnavailableError) {
            return c.json({ error: error.message }, 503);
          }
          throw error;
        }
      })
      .post(
        "/vouchers/:id/activate",
        zValidator("json", activateSchema),
        async (c) => {
          const { planId } = c.req.valid("json");
          const plan = findPlan(resolvePlans(), planId);
          if (!plan) return c.json({ error: "Unknown plan" }, 404);

          const repo = createWifiConsoleRepository(c.get("db"));
          const voucher = await repo.findVoucher(c.req.param("id"));
          if (!voucher) return c.json({ error: "Voucher not found" }, 404);
          // Idempotent: a repeat attempt reports the existing state instead of
          // creating a second hotspot user.
          if (voucher.activatedAt) {
            return c.json({ error: "Voucher is already activated" }, 409);
          }

          const owner = voucher.batchId ?? voucher.orderId ?? voucher.id;
          return withRouter(async (service, ctx) => {
            try {
              const { rosId } = await activateVoucherOnRouter(
                service,
                toHotspotUserInput(plan, {
                  code: voucher.code,
                  owner,
                  server: hotspotServer,
                }),
              );
              const activated = await repo.markActivated(
                voucher.id,
                rosId,
                clock(),
              );
              return ctx.json({ voucher: activated ?? voucher }, 201);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              await repo.markActivationFailed(voucher.id, message);
              if (error instanceof VoucherActivationError) {
                return ctx.json({ error: message }, 422);
              }
              if (error instanceof VoucherActivationUnavailableError) {
                return ctx.json({ error: message }, 503);
              }
              throw error;
            }
          })(c);
        },
      )
      .post("/vouchers/:id/revoke", async (c) => {
        const repo = createWifiConsoleRepository(c.get("db"));
        const voucher = await repo.findVoucher(c.req.param("id"));
        if (!voucher) return c.json({ error: "Voucher not found" }, 404);

        return withRouter(async (service, ctx) => {
          // The row is the only record of which router user to remove, so it goes
          // first: a revoked row with a live user could never be cleaned up, and
          // an operator told "revoked" would leave a working code in circulation.
          if (voucher.rosId) await service.removeUser(voucher.rosId);
          const revoked = await repo.revokeVoucher(voucher.id);
          return ctx.json({ voucher: revoked ?? voucher });
        })(c);
      })
  );
};

export type WifiRouterAppType = ReturnType<typeof createWifiRouterApp>;
