"use client";

import type { InferResponseType } from "hono/client";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

/** One hotspot order as returned by GET /api/wifi/orders */
export type WifiOrder = InferResponseType<
  typeof api.wifi.orders.$get,
  200
>["rows"][number];

/** One issued voucher as returned by GET /api/wifi/vouchers */
export type WifiVoucher = InferResponseType<
  typeof api.wifi.vouchers.$get,
  200
>["rows"][number];

/** One console minting run, as returned by GET /api/wifi/batches */
export type WifiBatch = InferResponseType<
  typeof api.wifi.batches.$get,
  200
>["batches"][number];

/** The plan catalogue the console mints against. */
export type WifiPlanOption = InferResponseType<
  typeof api.wifi.plans.$get,
  200
>["plans"][number];

/** Today's revenue + status breakdown from GET /api/wifi/stats */
export type WifiStats = InferResponseType<typeof api.wifi.stats.$get, 200>;

export interface WifiOrderFilters {
  status?: string[];
  limit?: number;
  offset?: number;
}

export interface WifiVoucherFilters {
  status?: WifiVoucher["status"];
  batchId?: string;
  limit?: number;
  offset?: number;
}

export const wifiKeys = {
  all: ["wifi"] as const,
  orders: (filters: WifiOrderFilters) =>
    [...wifiKeys.all, "orders", filters] as const,
  vouchers: (filters: WifiVoucherFilters) =>
    [...wifiKeys.all, "vouchers", filters] as const,
  batches: () => [...wifiKeys.all, "batches"] as const,
  stats: () => [...wifiKeys.all, "stats"] as const,
  plans: () => [...wifiKeys.all, "plans"] as const,
};

const wifiQueryOptions = {
  // Orders and vouchers move on the router's retry clock (seconds), not the
  // user's click cadence; 15s keeps the console fresh without polling hard.
  staleTime: 15_000,
} as const;

/**
 * List hotspot orders with a status filter and offset paging.
 *
 * Resolves to `null` on 401 so the UI renders a sign-in state instead of an
 * error — the WiFi payload carries phone numbers and revenue.
 */
export const useWifiOrders = (filters: WifiOrderFilters = {}) =>
  useQuery({
    queryKey: wifiKeys.orders(filters),
    queryFn: async () => {
      const res = await api.wifi.orders.$get({
        query: {
          limit: String(filters.limit ?? 25),
          offset: String(filters.offset ?? 0),
          ...(filters.status?.length
            ? { status: filters.status.join(",") }
            : {}),
        },
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch WiFi orders");
      return res.json();
    },
    ...wifiQueryOptions,
  });

/** List issued vouchers, optionally narrowed to one status or batch. */
export const useWifiVouchers = (filters: WifiVoucherFilters = {}) =>
  useQuery({
    queryKey: wifiKeys.vouchers(filters),
    queryFn: async () => {
      const res = await api.wifi.vouchers.$get({
        query: {
          limit: String(filters.limit ?? 25),
          offset: String(filters.offset ?? 0),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.batchId ? { batchId: filters.batchId } : {}),
        },
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch vouchers");
      return res.json();
    },
    ...wifiQueryOptions,
  });

/** Recent console minting runs, so a printed sheet stays traceable. */
export const useWifiBatches = () =>
  useQuery({
    queryKey: wifiKeys.batches(),
    queryFn: async () => {
      const res = await api.wifi.batches.$get();
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch voucher batches");
      const { batches } = await res.json();
      return batches;
    },
    ...wifiQueryOptions,
  });

/** Today's paid orders and revenue, plus lifetime status breakdowns. */
export const useWifiStats = () =>
  useQuery({
    queryKey: wifiKeys.stats(),
    queryFn: async () => {
      const res = await api.wifi.stats.$get();
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch WiFi stats");
      return res.json();
    },
    ...wifiQueryOptions,
  });

/** The plan catalogue — prices and RouterOS profiles come from the server. */
export const useWifiPlans = () =>
  useQuery({
    queryKey: wifiKeys.plans(),
    queryFn: async () => {
      const res = await api.wifi.plans.$get();
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch WiFi plans");
      const { plans } = await res.json();
      return plans;
    },
    // Profile names only change on deploy; no reason to refetch.
    staleTime: 5 * 60_000,
  });
