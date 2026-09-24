import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type {
  WifiOrderStatus,
  WifiVoucherChannel,
  WifiVoucherStatus,
} from "@turbo/db/schema";
import type { HotspotService } from "@turbo/routeros";
import type { WifiPlan } from "@turbo/wifi";
import {
  WIFI_ORDER_STATUSES,
  WIFI_VOUCHER_STATUSES,
  wifiOrder,
  wifiVoucher,
  wifiVoucherBatch,
} from "@turbo/db/schema";
import { isRouterOsUnavailable, RouterOsCommandError } from "@turbo/routeros";
import { mintVoucherBatch, toHotspotUserInput } from "@turbo/wifi";

import type { Db } from "../context";
import {
  VoucherActivationError,
  VoucherActivationUnavailableError,
} from "./activation-errors";

export type WifiOrderRow = typeof wifiOrder.$inferSelect;
export type WifiVoucherRow = typeof wifiVoucher.$inferSelect;
export type WifiVoucherBatchRow = typeof wifiVoucherBatch.$inferSelect;

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface ListOrdersParams {
  status?: WifiOrderStatus[];
  limit: number;
  offset: number;
}

export interface ListVouchersParams {
  status?: WifiVoucherStatus;
  batchId?: string;
  limit: number;
  offset: number;
}

export interface CreateVoucherBatchInput {
  label: string;
  plan: WifiPlan;
  quantity: number;
  createdBy: string | null;
  channel: WifiVoucherChannel;
  /** Router to create the hotspot users on. Required: no router, no batch. */
  hotspot: HotspotService;
  /** Hotspot server name for routers running more than one (per-area). */
  hotspotServer?: string;
  /** Injected for deterministic tests. */
  now?: () => Date;
}

export interface VoucherBatchResult {
  batch: WifiVoucherBatchRow;
  vouchers: WifiVoucherRow[];
}

/** A live session resolved back to the voucher, order and plan behind it. */
export interface SessionVoucher {
  voucherId: string;
  profile: string;
  phone: string | null;
  /** What the owning order collected; null for counter/batch vouchers. */
  amountKobo: number | null;
  limitBytesTotal: number | null;
  activatedAt: Date | null;
  bytesUsed: number;
}

/** Vouchers issued ever and so far today — every kind, bonus included. */
export interface VoucherGenerationSummary {
  total: number;
  today: number;
}

export interface VoucherUsage {
  bytesUsed: number;
  syncedAt: Date;
}

/**
 * Read/write surface for the web admin console.
 *
 * Deliberately separate from the shop's `OrderRepository` in `apps/server`:
 * that one owns the payment/fulfilment state machine, this one issues counter
 * sales and reads for the dashboard. Both share one Postgres.
 *
 * Counter vouchers are activated on RouterOS through the injected
 * `HotspotService`, which only `apps/server` can construct — it is the only
 * runtime with a WireGuard route to the hotspot. The web console reaches these
 * methods through the same-origin `/api/wifi-router` proxy.
 */
export interface WifiConsoleRepository {
  listOrders: (params: ListOrdersParams) => Promise<Page<WifiOrderRow>>;
  listVouchers: (params: ListVouchersParams) => Promise<Page<WifiVoucherRow>>;
  listBatches: (limit: number) => Promise<WifiVoucherBatchRow[]>;
  countOrdersByStatus: () => Promise<Record<WifiOrderStatus, number>>;
  countVouchersByStatus: () => Promise<Record<WifiVoucherStatus, number>>;
  voucherGenerationSummary: (now?: Date) => Promise<VoucherGenerationSummary>;
  todaySummary: (
    now?: Date,
  ) => Promise<{ paidOrders: number; revenueKobo: number }>;
  /** Mints a batch and creates every hotspot user; all-or-nothing. */
  createVoucherBatch: (
    input: CreateVoucherBatchInput,
  ) => Promise<VoucherBatchResult>;
  findVoucher: (id: string) => Promise<WifiVoucherRow | undefined>;
  /** Vouchers for the given codes, keyed by code, with their order's phone. */
  findVouchersByCodes: (
    codes: readonly string[],
  ) => Promise<Map<string, SessionVoucher>>;
  markActivated: (
    id: string,
    rosId: string,
    at: Date,
  ) => Promise<WifiVoucherRow | undefined>;
  markActivationFailed: (
    id: string,
    message: string,
  ) => Promise<WifiVoucherRow | undefined>;
  /** Snapshots router usage onto the voucher rows that own the sessions. */
  recordUsage: (usage: Map<string, VoucherUsage>) => Promise<number>;
  revokeVoucher: (id: string) => Promise<WifiVoucherRow | undefined>;
}

const startOfDay = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Creates the hotspot user for a voucher code, reusing one that already exists.
 *
 * Reuse matters because an earlier attempt can create the user and then lose
 * the reply: the router has it, our transaction does not. Creating it again
 * would be refused as a duplicate and roll back a batch that was actually fine.
 *
 * Failures are re-thrown as activation errors so the route can map them to a
 * status code without knowing about the RouterOS error taxonomy.
 */
export const activateVoucherOnRouter = async (
  hotspot: HotspotService,
  input: Parameters<HotspotService["createHotspotUser"]>[0],
): Promise<{ rosId: string; created: boolean }> => {
  try {
    const existing = await hotspot.findUser(input.name);
    if (existing) return { rosId: existing.id, created: false };
    const { id } = await hotspot.createHotspotUser(input);
    return { rosId: id, created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof RouterOsCommandError) {
      throw new VoucherActivationError(input.name, message, error.command);
    }
    if (isRouterOsUnavailable(error)) {
      throw new VoucherActivationUnavailableError(input.name, message);
    }
    throw error;
  }
};

/** Statuses with no rows must still appear, so callers can render a full set. */
const zeroFilled = <const T extends readonly string[]>(
  keys: T,
  rows: { value: string; total: number | bigint }[],
): Record<T[number], number> =>
  Object.fromEntries(
    keys.map((key) => [
      key,
      Number(rows.find((row) => row.value === key)?.total ?? 0),
    ]),
  ) as Record<T[number], number>;

export const createWifiConsoleRepository = (db: Db): WifiConsoleRepository => ({
  listOrders: async ({ status, limit, offset }) => {
    const where = status?.length
      ? inArray(wifiOrder.status, status)
      : undefined;
    const [rows, [total]] = await Promise.all([
      db
        .select()
        .from(wifiOrder)
        .where(where)
        .orderBy(desc(wifiOrder.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(wifiOrder).where(where),
    ]);
    return { rows, total: Number(total?.total ?? 0) };
  },

  listVouchers: async ({ status, batchId, limit, offset }) => {
    const where = and(
      status ? eq(wifiVoucher.status, status) : undefined,
      batchId ? eq(wifiVoucher.batchId, batchId) : undefined,
    );
    const [rows, [total]] = await Promise.all([
      db
        .select()
        .from(wifiVoucher)
        .where(where)
        .orderBy(desc(wifiVoucher.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(wifiVoucher).where(where),
    ]);
    return { rows, total: Number(total?.total ?? 0) };
  },

  listBatches: (limit) =>
    db
      .select()
      .from(wifiVoucherBatch)
      .orderBy(desc(wifiVoucherBatch.createdAt))
      .limit(limit),

  countOrdersByStatus: async () => {
    const rows = await db
      .select({ value: wifiOrder.status, total: count() })
      .from(wifiOrder)
      .groupBy(wifiOrder.status);
    return zeroFilled(WIFI_ORDER_STATUSES, rows);
  },

  countVouchersByStatus: async () => {
    const rows = await db
      .select({ value: wifiVoucher.status, total: count() })
      .from(wifiVoucher)
      .groupBy(wifiVoucher.status);
    return zeroFilled(WIFI_VOUCHER_STATUSES, rows);
  },

  voucherGenerationSummary: async (now = new Date()) => {
    const [totalRow] = await db.select({ total: count() }).from(wifiVoucher);
    const [todayRow] = await db
      .select({ today: count() })
      .from(wifiVoucher)
      .where(gte(wifiVoucher.createdAt, startOfDay(now)));
    return {
      total: totalRow?.total ?? 0,
      today: todayRow?.today ?? 0,
    };
  },

  todaySummary: async (now = new Date()) => {
    const [row] = await db
      .select({
        paidOrders: sql<number>`count(*)::int`,
        revenueKobo: sql<number>`coalesce(sum(${wifiOrder.amountKobo}), 0)::int`,
      })
      .from(wifiOrder)
      .where(
        and(
          inArray(wifiOrder.status, ["paid", "pending_router", "fulfilled"]),
          gte(wifiOrder.paidAt, startOfDay(now)),
        ),
      );
    return row ?? { paidOrders: 0, revenueKobo: 0 };
  },

  /**
   * Mints a printable sheet of counter vouchers **and creates every hotspot
   * user on the router**, in one transaction.
   *
   * The point of the console is that a code handed to a customer works, so a
   * partial result is worse than no result: any router failure rolls the whole
   * batch back and the route returns an error instead of a sheet. Users the
   * router already accepted are removed on the way out, since their rows are
   * about to disappear.
   *
   * The transaction is held open across the router calls — radio round-trips
   * are tens of milliseconds and a sheet is at most `MAX_BATCH_QUANTITY`, so
   * the safety is worth the open transaction. The router calls are serial for
   * the same reason: a burst of concurrent logins on one router is slower and
   * harder to unwind than a queue.
   */
  createVoucherBatch: async (input) => {
    const now = input.now ?? (() => new Date());

    return db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(wifiVoucherBatch)
        .values({
          label: input.label,
          planId: input.plan.id,
          profile: input.plan.rosProfile,
          quantity: input.quantity,
          createdBy: input.createdBy,
        })
        .returning();
      if (!batch) throw new Error("insert returned no batch row");

      const minted = await mintVoucherBatch({
        quantity: input.quantity,
        plan: input.plan,
        exists: async (code) => {
          const [row] = await tx
            .select({ id: wifiVoucher.id })
            .from(wifiVoucher)
            .where(eq(wifiVoucher.code, code))
            .limit(1);
          return row !== undefined;
        },
      });

      const createdRosIds: string[] = [];
      const codes: {
        code: string;
        profile: string;
        limitBytesTotal: number | undefined;
        rosId: string;
        activatedAt: Date;
      }[] = [];
      try {
        for (const voucher of minted) {
          const activation = await activateVoucherOnRouter(
            input.hotspot,
            toHotspotUserInput(input.plan, {
              code: voucher.code,
              owner: batch.id,
              server: input.hotspotServer,
            }),
          );
          if (activation.created) createdRosIds.push(activation.rosId);
          codes.push({
            code: voucher.code,
            profile: voucher.profile,
            limitBytesTotal: voucher.limitBytesTotal,
            rosId: activation.rosId,
            activatedAt: now(),
          });
        }
      } catch (error) {
        // Best-effort: the rows are gone either way, so leaving the users
        // behind would be orphaned access on the router.
        await Promise.all(
          createdRosIds.map((rosId) =>
            input.hotspot.removeUser(rosId).catch(() => undefined),
          ),
        );
        throw error;
      }

      const vouchers = await tx
        .insert(wifiVoucher)
        .values(
          codes.map((voucher) => ({
            batchId: batch.id,
            code: voucher.code,
            profile: voucher.profile,
            limitBytesTotal: voucher.limitBytesTotal,
            channel: input.channel,
            rosId: voucher.rosId,
            activatedAt: voucher.activatedAt,
          })),
        )
        .returning();

      return { batch, vouchers };
    });
  },

  findVoucher: async (id) => {
    const [row] = await db
      .select()
      .from(wifiVoucher)
      .where(eq(wifiVoucher.id, id))
      .limit(1);
    return row;
  },

  findVouchersByCodes: async (codes) => {
    if (codes.length === 0) return new Map();
    const rows = await db
      .select({
        voucherId: wifiVoucher.id,
        code: wifiVoucher.code,
        profile: wifiVoucher.profile,
        limitBytesTotal: wifiVoucher.limitBytesTotal,
        activatedAt: wifiVoucher.activatedAt,
        bytesUsed: wifiVoucher.bytesUsed,
        phone: wifiOrder.phone,
        amountKobo: wifiOrder.amountKobo,
      })
      .from(wifiVoucher)
      .leftJoin(wifiOrder, eq(wifiVoucher.orderId, wifiOrder.id))
      .where(inArray(wifiVoucher.code, [...codes]));

    return new Map(
      rows.map((row) => [
        row.code,
        {
          voucherId: row.voucherId,
          profile: row.profile,
          phone: row.phone ?? null,
          amountKobo: row.amountKobo ?? null,
          limitBytesTotal: row.limitBytesTotal ?? null,
          activatedAt: row.activatedAt ?? null,
          bytesUsed: row.bytesUsed,
        },
      ]),
    );
  },

  markActivated: async (id, rosId, at) => {
    const [row] = await db
      .update(wifiVoucher)
      .set({ rosId, activatedAt: at, lastError: null })
      .where(eq(wifiVoucher.id, id))
      .returning();
    return row;
  },

  markActivationFailed: async (id, message) => {
    const [row] = await db
      .update(wifiVoucher)
      .set({ lastError: message })
      .where(eq(wifiVoucher.id, id))
      .returning();
    return row;
  },

  /**
   * Writes a usage snapshot read from the router. Codes with no local voucher
   * (someone else's hotspot user) are ignored rather than failing the sync.
   */
  recordUsage: async (usage) => {
    const entries = [...usage.entries()];
    if (entries.length === 0) return 0;
    const results = await Promise.all(
      entries.map(([code, snapshot]) =>
        db
          .update(wifiVoucher)
          .set({ bytesUsed: snapshot.bytesUsed, syncedAt: snapshot.syncedAt })
          .where(eq(wifiVoucher.code, code))
          .returning({ id: wifiVoucher.id }),
      ),
    );
    return results.reduce((total, rows) => total + rows.length, 0);
  },

  /**
   * Idempotent: re-revoking an already-revoked voucher succeeds and returns the
   * row. `undefined` means the id does not exist, which the route maps to 404.
   *
   * Callers must remove the hotspot user *before* calling this — the row is the
   * only record of which router user to remove.
   */
  revokeVoucher: async (id) => {
    const [row] = await db
      .update(wifiVoucher)
      .set({ status: "revoked" })
      .where(eq(wifiVoucher.id, id))
      .returning();
    return row;
  },
});
