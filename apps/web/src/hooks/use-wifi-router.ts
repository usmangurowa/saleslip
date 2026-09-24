"use client";

import type { InferResponseType } from "hono/client";
import { env } from "@/env";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createWifiRouterClient } from "@turbo/api/wifi-router-client";

/**
 * The client instance, built lazily so the origin is the browser's own.
 *
 * `hc` needs an absolute URL, and every call must be same-origin: the routes
 * live on `apps/server` (the only runtime with a route to the hotspot) and are
 * reached through the proxy at `/api/wifi-router`. Requests carry the session
 * cookie automatically because they never leave this origin.
 */
const routerApi = () => {
  const origin =
    typeof window === "undefined"
      ? env.NEXT_PUBLIC_APP_URL
      : window.location.origin;
  return createWifiRouterClient(origin);
};

type RouterApi = ReturnType<typeof createWifiRouterClient>;

/** One live hotspot session, resolved back to its voucher and plan. */
export type HotspotSession = InferResponseType<
  RouterApi["sessions"]["$get"],
  200
>["sessions"][number];

/** Router reachability plus its resource readout. */
export type RouterHealth = InferResponseType<RouterApi["health"]["$get"], 200>;

/** Codes minted by the counter dialog. Already live on the hotspot. */
export type MintedBatch = InferResponseType<
  RouterApi["vouchers"]["batch"]["$post"],
  201
>;

export const wifiRouterKeys = {
  all: ["wifi-router"] as const,
  health: () => [...wifiRouterKeys.all, "health"] as const,
  sessions: () => [...wifiRouterKeys.all, "sessions"] as const,
};

/** Pulls the server's error message so toasts say what actually failed. */
const errorFrom = async (res: Response, fallback: string) => {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  const error = new Error(body?.error ?? fallback);
  // Status rides along so callers can tell infra failures (503) from auth ones.
  (error as Error & { status?: number }).status = res.status;
  return error;
};

/**
 * Router health, polled because the hotspot is the only part of the console
 * that can go away without anyone touching the dashboard.
 */
export const useRouterHealth = () =>
  useQuery({
    queryKey: wifiRouterKeys.health(),
    queryFn: async (): Promise<RouterHealth | null> => {
      const res = await routerApi().health.$get();
      if (res.status === 401) return null;
      // 503 means "no hotspot configured" — a state, not a failed request.
      if (res.status === 503) {
        const { error } = (await res.json()) as { error: string };
        return { reachable: false, error, resource: null };
      }
      if (!res.ok) throw await errorFrom(res, "Failed to reach the router");
      return res.json();
    },
    refetchInterval: 30_000,
  });

/**
 * Who is online right now.
 *
 * Read straight off the router, so it is polled rather than cached: a session
 * that ended thirty seconds ago is not useful to an operator looking at it.
 */
export const useHotspotSessions = () =>
  useQuery({
    queryKey: wifiRouterKeys.sessions(),
    queryFn: async () => {
      const res = await routerApi().sessions.$get();
      if (res.status === 401) return null;
      if (!res.ok) throw await errorFrom(res, "Failed to load live sessions");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 15_000,
  });

/** Drop one client; they can reconnect with the same code. */
export const useKickSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (user: string) => {
      const res = await routerApi().sessions[":user"].kick.$post({
        param: { user },
      });
      if (!res.ok) throw await errorFrom(res, "Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wifiRouterKeys.sessions(),
      });
    },
  });
};

/**
 * Snapshot router usage onto the voucher rows.
 *
 * The router is the source of truth for bytes; this copies its counters into
 * Postgres so a code's history survives the session ending.
 */
export const useSyncUsage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await routerApi().sessions.sync.$post();
      if (!res.ok) throw await errorFrom(res, "Failed to sync usage");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: wifiRouterKeys.all });
    },
  });
};

/**
 * Mint a printable batch of counter vouchers.
 *
 * Creating the codes *is* activating them: the router user is created in the
 * same transaction, so a sheet that comes back is a sheet that works. A
 * failure means nothing was issued and it is safe to retry.
 */
export const useMintVoucherBatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      planId: string;
      quantity: number;
      label: string;
    }): Promise<MintedBatch> => {
      const res = await routerApi().vouchers.batch.$post({ json: input });
      if (!res.ok) throw await errorFrom(res, "Failed to generate vouchers");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: wifiRouterKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["wifi"] });
    },
  });
};

/** Activate a code issued before the router was reachable. */
export const useActivateVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, planId }: { id: string; planId: string }) => {
      const res = await routerApi().vouchers[":id"].activate.$post({
        param: { id },
        json: { planId },
      });
      if (!res.ok) throw await errorFrom(res, "Failed to activate the voucher");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: wifiRouterKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["wifi"] });
    },
  });
};

/**
 * Revoke a voucher and remove its hotspot user.
 *
 * The router call happens first, so a router outage leaves the code active and
 * surfaces an error rather than reporting a revoke that did not happen.
 */
export const useRevokeVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await routerApi().vouchers[":id"].revoke.$post({
        param: { id },
      });
      if (!res.ok) throw await errorFrom(res, "Failed to revoke voucher");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: wifiRouterKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["wifi"] });
    },
  });
};
