import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";

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
  wifiPlan,
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

export interface CreatePlanInput {
  id: string;
  name: string;
  description: string;
  priceKobo: number;
  rosProfile: string;
  dataLimitBytes?: number | null;
  uptimeLimit?: string | null;
  validityLabel: string;
  sortOrder?: number;
}

export type UpdatePlanInput = Partial<Omit<CreatePlanInput, "id">> & {
  active?: boolean;
  sortOrder?: number;
};

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

/** Paid orders and revenue over one dashboard range. */
export interface RevenueRangeSummary {
  paidOrders: number;
  revenueKobo: number;
}

/** Orders counted as money-in for dashboard ranges (paid → fulfilled). */
const PAID_STATUSES = ["paid", "pending_router", "fulfilled"] as const;

/** Paid orders and revenue for every dashboard range, in one aggregate. */
export interface RevenueSummary {
  today: RevenueRangeSummary;
  /** Trailing 7 days including today. */
  week: RevenueRangeSummary;
  /** Trailing 30 days including today. */
  month: RevenueRangeSummary;
  all: RevenueRangeSummary;
}

/** One buying customer: every order they have placed, rolled up by phone. */
export interface CustomerSummary {
  phone: string;
  email: string | null;
  orders: number;
  paidOrders: number;
  totalPaidKobo: number;
  /** Plan of their most recent order, for the "what they last bought" cell. */
  latestPlanId: string | null;
  lastOrderAt: Date;
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
  /** Customers rolled up from orders: one row per phone number. */
  customerSummaries: (params: {
    limit: number;
    offset: number;
  }) => Promise<Page<CustomerSummary>>;
  /** The DB-backed plan catalogue; inactive rows are hidden unless asked for. */
  listPlans: (params?: {
    includeInactive?: boolean;
  }) => Promise<WifiPlan[]>;
  createPlan: (input: CreatePlanInput) => Promise<WifiPlan>;
  updatePlan: (id: string, input: UpdatePlanInput) => Promise<WifiPlan | undefined>;
  listBatches: (limit: number) => Promise<WifiVoucherBatchRow[]>;
  countOrdersByStatus: () => Promise<Record<WifiOrderStatus, number>>;
  countVouchersByStatus: () => Promise<Record<WifiVoucherStatus, number>>;
  voucherGenerationSummary: (now?: Date) => Promise<VoucherGenerationSummary>;
  todaySummary: (now?: Date) => Promise<RevenueRangeSummary>;
  revenueSummary: (now?: Date) => Promise<RevenueSummary>;
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

  /**
   * The customers view: orders grouped by phone number, because a returning
   * buyer is one customer no matter how many orders they leave behind. Only
   * orders with a phone count — a counter sale with no contact cannot be
   * attributed to anyone. Latest plan rides along so the table can show what
   * they last bought without a second query per row.
   */
  customerSummaries: async ({ limit, offset }) => {
    const paidFilter = inArray(wifiOrder.status, [...PAID_STATUSES]);
    const hasPhone = isNotNull(wifiOrder.phone);
    const [rows, [total]] = await Promise.all([
      db
        .select({
          // min() of the group key is the key itself; this keeps the type
          // non-nullable now that the where clause excludes null phones.
          phone: sql<string>`min(${wifiOrder.phone})`,
          email: sql<string | null>`max(${wifiOrder.email})`,
          orders: sql<number>`count(*)::int`,
          paidOrders: sql<number>`(count(*) filter (where ${paidFilter}))::int`,
          totalPaidKobo: sql<number>`coalesce(sum(${wifiOrder.amountKobo}) filter (where ${paidFilter}), 0)::int`,
          latestPlanId: sql<
            string | null
          >`(array_agg(${wifiOrder.planId} order by ${wifiOrder.createdAt} desc))[1]`,
          lastOrderAt: sql<Date>`max(${wifiOrder.createdAt})`,
        })
        .from(wifiOrder)
        .where(hasPhone)
        .groupBy(wifiOrder.phone)
        .orderBy(desc(sql`max(${wifiOrder.createdAt})`))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: countDistinct(wifiOrder.phone) })
        .from(wifiOrder)
        .where(hasPhone),
    ]);
    return { rows, total: Number(total?.total ?? 0) };
  },

  listPlans: async ({ includeInactive } = {}) => {
    const where = includeInactive ? undefined : eq(wifiPlan.active, true);
    const rows = await db
      .select()
      .from(wifiPlan)
      .where(where)
      .orderBy(wifiPlan.sortOrder, wifiPlan.id);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceKobo: row.priceKobo,
      rosProfile: row.rosProfile,
      dataLimitBytes: row.dataLimitBytes ?? undefined,
      uptimeLimit: row.uptimeLimit ?? undefined,
      validityLabel: row.validityLabel,
      active: row.active,
      sortOrder: row.sortOrder,
    }));
  },

  createPlan: async (input) => {
    const [row] = await db
      .insert(wifiPlan)
      .values({
        id: input.id,
        name: input.name,
        description: input.description,
        priceKobo: input.priceKobo,
        rosProfile: input.rosProfile,
        dataLimitBytes: input.dataLimitBytes ?? null,
        uptimeLimit: input.uptimeLimit ?? null,
        validityLabel: input.validityLabel,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    if (!row) throw new Error("plan insert returned no row");
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      priceKobo: row.priceKobo,
      rosProfile: row.rosProfile,
      dataLimitBytes: row.dataLimitBytes ?? undefined,
      uptimeLimit: row.uptimeLimit ?? undefined,
      validityLabel: row.validityLabel,
    };
  },

  updatePlan: async (id, input) => {
    const [row] = await db
      .update(wifiPlan)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.priceKobo !== undefined
          ? { priceKobo: input.priceKobo }
          : {}),
        ...(input.rosProfile !== undefined
          ? { rosProfile: input.rosProfile }
          : {}),
        ...(input.dataLimitBytes !== undefined
          ? { dataLimitBytes: input.dataLimitBytes }
          : {}),
        ...(input.uptimeLimit !== undefined
          ? { uptimeLimit: input.uptimeLimit }
          : {}),
        ...(input.validityLabel !== undefined
          ? { validityLabel: input.validityLabel }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(wifiPlan.id, id))
      .returning();
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      priceKobo: row.priceKobo,
      rosProfile: row.rosProfile,
      dataLimitBytes: row.dataLimitBytes ?? undefined,
      uptimeLimit: row.uptimeLimit ?? undefined,
      validityLabel: row.validityLabel,
    };
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
          inArray(wifiOrder.status, [...PAID_STATUSES]),
          gte(wifiOrder.paidAt, startOfDay(now)),
        ),
      );
    return row ?? { paidOrders: 0, revenueKobo: 0 };
  },

  revenueSummary: async (now = new Date()) => {
    const day = startOfDay(now);
    // Trailing windows include today: 7 days back, 30 days back.
    const week = new Date(day.getTime() - 6 * 86_400_000);
    const month = new Date(day.getTime() - 29 * 86_400_000);
    // postgres.js cannot bind raw Date objects inside drizzle `sql` templates
    // (Buffer.byteLength throws on a Date), so pass ISO strings instead. PG
    // parses them as timestamps; the trailing "Z" is ignored for `timestamp
    // without time zone`, which matches how the boundaries were computed.
    const iso = (d: Date) => d.toISOString();
    const [row] = await db
      .select({
        todayPaid: sql<number>`(count(*) filter (where ${wifiOrder.paidAt} >= ${iso(day)}))::int`,
        todayRevenue: sql<number>`coalesce(sum(${wifiOrder.amountKobo}) filter (where ${wifiOrder.paidAt} >= ${iso(day)}), 0)::int`,
        weekPaid: sql<number>`(count(*) filter (where ${wifiOrder.paidAt} >= ${iso(week)}))::int`,
        weekRevenue: sql<number>`coalesce(sum(${wifiOrder.amountKobo}) filter (where ${wifiOrder.paidAt} >= ${iso(week)}), 0)::int`,
        monthPaid: sql<number>`(count(*) filter (where ${wifiOrder.paidAt} >= ${iso(month)}))::int`,
        monthRevenue: sql<number>`coalesce(sum(${wifiOrder.amountKobo}) filter (where ${wifiOrder.paidAt} >= ${iso(month)}), 0)::int`,
        allPaid: sql<number>`count(*)::int`,
        allRevenue: sql<number>`coalesce(sum(${wifiOrder.amountKobo}), 0)::int`,
      })
      .from(wifiOrder)
      .where(inArray(wifiOrder.status, [...PAID_STATUSES]));
    return {
      today: {
        paidOrders: row?.todayPaid ?? 0,
        revenueKobo: row?.todayRevenue ?? 0,
      },
      week: {
        paidOrders: row?.weekPaid ?? 0,
        revenueKobo: row?.weekRevenue ?? 0,
      },
      month: {
        paidOrders: row?.monthPaid ?? 0,
        revenueKobo: row?.monthRevenue ?? 0,
      },
      all: {
        paidOrders: row?.allPaid ?? 0,
        revenueKobo: row?.allRevenue ?? 0,
      },
    };
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
