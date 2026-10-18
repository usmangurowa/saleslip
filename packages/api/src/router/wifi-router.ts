import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import type { HotspotActiveSession, HotspotService } from "@turbo/routeros";
import { isRouterOsUnavailable } from "@turbo/routeros";
import {
  findPlan,
  InvalidBatchQuantityError,
  MAX_BATCH_QUANTITY,
  parseRosDurationMs,
  toHotspotUserInput,
} from "@turbo/wifi";

import type { AppContext, AuthWithApi, Db } from "../context";
import type {
  UsedVoucherRow,
  WifiConsoleRepository,
  WifiVoucherRow,
} from "../wifi/repository";
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

/** One request may settle at most this many vouchers against the router. */
const MAX_BULK_DELETE = 200;

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_DELETE),
});

// --- attendance board indicators ---------------------------------------------

/** Yellow once less than this is left on the voucher's session. */
const EXPIRING_SOON_MS = 60 * 60_000;
/** Red once a session has been up this long … */
const STALLED_UPTIME_MS = 5 * 60_000;
/** … and moved less than this much data. */
const STALLED_BYTES = 1_000_000;
/** The router's free-trial profile; its sessions are always short-lived. */
const TRIAL_PROFILE = "trial-5m";

export type AttendanceIndicator = "green" | "yellow" | "red" | "black";

export interface AttendanceIndicatorResult {
  indicator: AttendanceIndicator;
  /** Operator-facing explanation for anything not green. */
  reason: string | null;
}

// --- voucher deletion settlement ----------------------------------------------

export type VoucherDeletionOutcome =
  /** Row gone; `revokedRouterUser` says whether a live code was removed too. */
  | { outcome: "deleted"; revokedRouterUser: boolean }
  /** A paid/pending_router order still owns the code — the sweep must finish. */
  | { outcome: "blocked-awaiting-fulfilment" }
  /** Active voucher, but the router could not be asked — nothing was deleted. */
  | { outcome: "skipped-router-unreachable" }
  /** The id resolved once but the row vanished before settlement. */
  | { outcome: "not-found" };

/**
 * The one settlement rulebook for deleting vouchers, shared by the single
 * and bulk routes so the two can never drift:
 *
 * 1. A voucher whose order is still `paid`/`pending_router` is blocked — the
 *    retry sweep resumes from the row and would re-mint a different code.
 * 2. Revoked rows are history-only: no router call.
 * 3. Active rows ask the router by code (codes can outlive their `rosId`) and
 *    remove a live user first — fail-closed, never orphan a working code.
 */
export const settleVoucherDeletion = async (
  repo: WifiConsoleRepository,
  hotspot: HotspotService | undefined,
  voucher: WifiVoucherRow,
  orderStatus: string | null,
): Promise<VoucherDeletionOutcome> => {
  if (
    voucher.status === "active" &&
    (orderStatus === "paid" || orderStatus === "pending_router")
  ) {
    return { outcome: "blocked-awaiting-fulfilment" };
  }
  if (voucher.status !== "active") {
    const deleted = await repo.deleteVoucher(voucher.id);
    return deleted
      ? { outcome: "deleted", revokedRouterUser: false }
      : { outcome: "not-found" };
  }
  if (!hotspot) return { outcome: "skipped-router-unreachable" };
  try {
    let revokedRouterUser = false;
    const user = await hotspot.findUser(voucher.code);
    if (user) {
      await hotspot.removeUser(user.id);
      revokedRouterUser = true;
    }
    const deleted = await repo.deleteVoucher(voucher.id);
    return deleted
      ? { outcome: "deleted", revokedRouterUser }
      : { outcome: "not-found" };
  } catch (error) {
    if (isRouterOsUnavailable(error)) {
      return { outcome: "skipped-router-unreachable" };
    }
    throw error;
  }
};

/**
 * Colour for a *connected* session. Red (no internet) outranks yellow
 * (trial/expiring) outranks green — a stalled or WAN-less session is the
 * thing staff should act on first.
 */
export const connectedIndicator = (
  session: Pick<
    HotspotActiveSession,
    "uptime" | "sessionTimeLeft" | "bytesIn" | "bytesOut"
  >,
  profile: string | undefined,
  wanReachable: boolean,
): AttendanceIndicatorResult => {
  if (!wanReachable) {
    return { indicator: "red", reason: "Connected but the internet is down" };
  }
  const uptimeMs = parseRosDurationMs(session.uptime);
  const bytes = (session.bytesIn ?? 0) + (session.bytesOut ?? 0);
  if (
    uptimeMs !== undefined &&
    uptimeMs >= STALLED_UPTIME_MS &&
    bytes < STALLED_BYTES
  ) {
    return { indicator: "red", reason: "Connected but barely moving data" };
  }
  if (profile === TRIAL_PROFILE) {
    return { indicator: "yellow", reason: "Free trial" };
  }
  const leftMs = parseRosDurationMs(session.sessionTimeLeft);
  if (leftMs !== undefined && leftMs <= EXPIRING_SOON_MS) {
    return {
      indicator: "yellow",
      reason: `Expires in ${Math.max(1, Math.round(leftMs / 60_000))} min`,
    };
  }
  return { indicator: "green", reason: null };
};

// Profile writes stay on the safe subset: no on-login script, no server-wide
// knobs. `name` is the identity plans reference, so it is required on create.
const profileFieldsSchema = {
  name: z.string().trim().min(1).max(64),
  rateLimit: z.string().trim().min(1).max(64).optional(),
  sharedUsers: z.number().int().min(1).max(255).optional(),
  sessionTimeout: z.string().trim().min(1).max(32).optional(),
};
const profileCreateSchema = z.object(profileFieldsSchema);
const profileUpdateSchema = z
  .object({
    ...profileFieldsSchema,
    name: profileFieldsSchema.name.optional(),
  })
  .refine(
    (input) =>
      Object.values(input as Record<string, unknown>).some(
        (value) => value !== undefined,
      ),
    { message: "At least one field is required" },
  );

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
      .post("/profiles", zValidator("json", profileCreateSchema), async (c) => {
        const input = c.req.valid("json");
        return withRouter(async (service, ctx) => {
          const { id } = await service.createProfile(input);
          return ctx.json({ profile: { id, ...input } }, 201);
        })(c);
      })
      .patch(
        "/profiles/:id",
        zValidator("json", profileUpdateSchema),
        async (c) => {
          const id = c.req.param("id");
          const input = c.req.valid("json");
          return withRouter(async (service, ctx) => {
            await service.updateProfile(id, input);
            return ctx.json({ ok: true });
          })(c);
        },
      )
      .delete("/profiles/:id", async (c) => {
        const id = c.req.param("id");
        return withRouter(async (service, ctx) => {
          await service.removeProfile(id);
          return ctx.json({ ok: true });
        })(c);
      })
      .get("/sessions", async (c) => {
        const repo = createWifiConsoleRepository(c.get("db"));
        const plans = resolvePlans();
        const limit = Math.min(
          Math.max(Number(c.req.query("limit") ?? 50) || 50, 1),
          200,
        );
        const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);

        const [page, today] = await Promise.all([
          repo.listUsedVouchers({ limit, offset }),
          repo.todaySummary(),
        ]);

        // Board rows start disconnected (black); a reachable router overlays
        // live state. This is also the entire response when the router is
        // down — the board degrades instead of erroring.
        const baseRow = (voucher: UsedVoucherRow) => ({
          code: voucher.code,
          known: true,
          planName:
            plans.find((p) => p.rosProfile === voucher.profile)?.name ?? null,
          phone: voucher.phone,
          amountKobo: voucher.amountKobo,
          batchLabel: voucher.batchLabel,
          channel: voucher.channel,
          profile: voucher.profile,
          activatedAt: voucher.activatedAt?.toISOString() ?? null,
          lastConnectedAt: voucher.lastConnectedAt?.toISOString() ?? null,
          lastSyncedAt: voucher.syncedAt?.toISOString() ?? null,
          bytesUsed: voucher.bytesUsed,
          status: "disconnected" as const,
          indicator: "black" as const,
          reason: null,
          address: null,
          macAddress: null,
          uptime: null,
          sessionTimeLeft: null,
          sessionBytes: null,
        });

        const board = {
          routerReachable: false,
          wanReachable: null as boolean | null,
          connected: 0,
          revenueKoboToday: today.revenueKobo,
          total: page.total,
          rows: page.rows.map(baseRow),
        };
        if (!hotspot) return c.json(board);

        let sessions: HotspotActiveSession[];
        try {
          sessions = await hotspot.listActive();
        } catch (error) {
          // Router down: keep the board, every row black. Anything else is a
          // real error and still 500s.
          if (isRouterOsUnavailable(error)) return c.json(board);
          throw error;
        }
        // Write-behind: codes seen connected right now get their
        // last-connected stamp so they stay on the board after they log off.
        // Best-effort — a failed stamp must not blank the board.
        await repo
          .markVouchersConnected(
            sessions.map((session) => session.user),
            clock(),
          )
          .catch(() => undefined);
        // A failed heartbeat means "assume no internet", not "fail the board".
        const wanReachable = await hotspot.wanReachable().catch(() => false);

        const byCode = new Map(sessions.map((s) => [s.user, s]));
        const rows = page.rows.map((voucher) => {
          const session = byCode.get(voucher.code);
          if (!session) return baseRow(voucher);
          const { indicator, reason } = connectedIndicator(
            session,
            voucher.profile,
            wanReachable,
          );
          return {
            ...baseRow(voucher),
            status: "connected" as const,
            indicator,
            reason,
            address: session.address ?? null,
            macAddress: session.macAddress ?? null,
            uptime: session.uptime ?? null,
            sessionTimeLeft: session.sessionTimeLeft ?? null,
            sessionBytes: (session.bytesIn ?? 0) + (session.bytesOut ?? 0),
          };
        });

        // Foreign hotspot users (Mikhmon-minted, manually created) have no
        // voucher to anchor a row, so they appear only while connected —
        // hiding them would make the board lie about the load on the router.
        const known = new Set(page.rows.map((voucher) => voucher.code));
        const foreign = sessions
          .filter((session) => !known.has(session.user))
          .map((session) => {
            const { indicator, reason } = connectedIndicator(
              session,
              undefined,
              wanReachable,
            );
            return {
              code: session.user,
              known: false,
              planName: null,
              phone: null,
              amountKobo: null,
              batchLabel: null,
              channel: null,
              profile: null,
              activatedAt: null,
              lastConnectedAt: null,
              lastSyncedAt: null,
              bytesUsed: 0,
              status: "connected" as const,
              indicator,
              reason,
              address: session.address ?? null,
              macAddress: session.macAddress ?? null,
              uptime: session.uptime ?? null,
              sessionTimeLeft: session.sessionTimeLeft ?? null,
              sessionBytes: (session.bytesIn ?? 0) + (session.bytesOut ?? 0),
            };
          });

        return c.json({
          ...board,
          routerReachable: true,
          wanReachable,
          connected: sessions.length,
          rows: [...rows, ...foreign],
        });
      })
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
      .delete("/vouchers/:id", async (c) => {
        const repo = createWifiConsoleRepository(c.get("db"));
        const found = await repo.findVoucherWithOrder(c.req.param("id"));
        if (!found) return c.json({ error: "Voucher not found" }, 404);

        const settlement = await settleVoucherDeletion(
          repo,
          hotspot,
          found.voucher,
          found.orderStatus,
        );
        switch (settlement.outcome) {
          case "blocked-awaiting-fulfilment":
            return c.json(
              { error: "Voucher is still awaiting fulfilment" },
              409,
            );
          case "skipped-router-unreachable":
            return c.json({ error: "Router unreachable" }, 503);
          case "not-found":
            return c.json({ error: "Voucher not found" }, 404);
          case "deleted":
            return c.json({
              deleted: true,
              revokedRouterUser: settlement.revokedRouterUser,
            });
        }
      })
      .post(
        "/vouchers/bulk-delete",
        zValidator("json", bulkDeleteSchema),
        async (c) => {
          const repo = createWifiConsoleRepository(c.get("db"));
          const { ids } = c.req.valid("json");

          // Partial success by design: every voucher settles independently
          // with the same rulebook as the single delete, and the response
          // reports exactly what happened to each. Nothing is ever orphaned.
          const results: {
            id: string;
            code: string | null;
            outcome: VoucherDeletionOutcome["outcome"];
            revokedRouterUser?: boolean;
          }[] = [];
          for (const id of ids) {
            const found = await repo.findVoucherWithOrder(id);
            if (!found) {
              results.push({ id, code: null, outcome: "not-found" });
              continue;
            }
            const settlement = await settleVoucherDeletion(
              repo,
              hotspot,
              found.voucher,
              found.orderStatus,
            );
            results.push({
              id,
              code: found.voucher.code,
              outcome: settlement.outcome,
              ...(settlement.outcome === "deleted"
                ? { revokedRouterUser: settlement.revokedRouterUser }
                : {}),
            });
          }

          const deleted = results.filter((r) => r.outcome === "deleted");
          return c.json({
            summary: {
              deleted: deleted.length,
              revokedRouterUsers: deleted.filter(
                (r) => r.revokedRouterUser === true,
              ).length,
              blocked: results.filter(
                (r) => r.outcome === "blocked-awaiting-fulfilment",
              ).length,
              skippedRouter: results.filter(
                (r) => r.outcome === "skipped-router-unreachable",
              ).length,
              notFound: results.filter((r) => r.outcome === "not-found").length,
            },
            results,
          });
        },
      )
      .delete("/vouchers/batch/:id", async (c) => {
        const repo = createWifiConsoleRepository(c.get("db"));
        const batch = await repo.findVoucherBatch(c.req.param("id"));
        if (!batch) return c.json({ error: "Batch not found" }, 404);
        const vouchers = await repo.listVouchersByBatch(batch.id);

        // All-or-nothing, the inverse of minting: every live code is removed
        // from the router *before* any row disappears, and any router failure
        // aborts with nothing deleted. Batch vouchers carry no order (counter
        // channel), so the awaiting-fulfilment guard cannot apply here.
        let revokedRouterUsers = 0;
        for (const voucher of vouchers) {
          if (voucher.status !== "active") continue;
          if (!hotspot) {
            return c.json({ error: "Router unreachable" }, 503);
          }
          try {
            const user = await hotspot.findUser(voucher.code);
            if (user) {
              await hotspot.removeUser(user.id);
              revokedRouterUsers += 1;
            }
          } catch (error) {
            if (isRouterOsUnavailable(error)) {
              return c.json({ error: "Router unreachable" }, 503);
            }
            throw error;
          }
        }

        const deletedVouchers = await repo.deleteVouchersByBatch(batch.id);
        const deleted = await repo.deleteVoucherBatch(batch.id);
        if (!deleted) return c.json({ error: "Batch not found" }, 404);
        return c.json({
          deleted: true,
          label: batch.label,
          vouchers: deletedVouchers,
          revokedRouterUsers,
        });
      })
  );
};

export type WifiRouterAppType = ReturnType<typeof createWifiRouterApp>;
