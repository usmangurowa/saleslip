import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type {
  WifiOrderStatus,
  WifiVoucherChannel,
  WifiVoucherStatus,
} from "@turbo/db/schema";
import type { WifiPlan } from "@turbo/wifi";
import {
  WIFI_ORDER_STATUSES,
  WIFI_VOUCHER_STATUSES,
  wifiOrder,
  wifiVoucher,
  wifiVoucherBatch,
} from "@turbo/db/schema";
import { mintVoucherBatch } from "@turbo/wifi";

import type { Db } from "../context";

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
}

export interface VoucherBatchResult {
  batch: WifiVoucherBatchRow;
  vouchers: WifiVoucherRow[];
}

/**
 * Read/write surface for the web admin console.
 *
 * Deliberately separate from the shop's `OrderRepository` in `apps/server`:
 * that one owns the payment/fulfilment state machine, this one only issues
 * counter sales and reads for the dashboard. Both share one Postgres.
 *
 * Counter vouchers are recorded here but NOT activated on RouterOS — the web
 * container has no WireGuard route to the hotspot. Activation stays manual
 * (Mikhmon) until the local-network slice lands.
 */
export interface WifiConsoleRepository {
  listOrders: (params: ListOrdersParams) => Promise<Page<WifiOrderRow>>;
  listVouchers: (params: ListVouchersParams) => Promise<Page<WifiVoucherRow>>;
  listBatches: (limit: number) => Promise<WifiVoucherBatchRow[]>;
  countOrdersByStatus: () => Promise<Record<WifiOrderStatus, number>>;
  countVouchersByStatus: () => Promise<Record<WifiVoucherStatus, number>>;
  todaySummary: (
    now?: Date,
  ) => Promise<{ paidOrders: number; revenueKobo: number }>;
  createVoucherBatch: (
    input: CreateVoucherBatchInput,
  ) => Promise<VoucherBatchResult>;
  revokeVoucher: (id: string) => Promise<WifiVoucherRow | undefined>;
}

const startOfDay = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
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
   * Mints a printable sheet of counter vouchers. The whole batch is written in
   * one transaction: a partially-minted sheet would make the printed run
   * impossible to reconcile.
   */
  createVoucherBatch: (input) =>
    db.transaction(async (tx) => {
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

      const vouchers = await tx
        .insert(wifiVoucher)
        .values(
          minted.map((voucher) => ({
            batchId: batch.id,
            code: voucher.code,
            profile: voucher.profile,
            limitBytesTotal: voucher.limitBytesTotal,
            channel: input.channel,
          })),
        )
        .returning();

      return { batch, vouchers };
    }),

  /**
   * Idempotent: re-revoking an already-revoked voucher succeeds and returns the
   * row. `undefined` means the id does not exist, which the route maps to 404.
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
