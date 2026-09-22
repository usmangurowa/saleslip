import { Hono } from "hono";

import { isRouterOsUnavailable } from "@turbo/routeros";

import type { WifiDeps } from "../deps";

type Probe = "ok" | "down" | "disabled";

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  db: Probe;
  router: Probe;
  routerError?: string;
}

const HEALTH_TIMEOUT_MS = 5_000;

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

export const checkHealth = async (deps: WifiDeps): Promise<HealthReport> => {
  const db: Probe = await withTimeout(deps.pingDb(), HEALTH_TIMEOUT_MS)
    .then((): Probe => "ok")
    .catch((): Probe => "down");

  let router: Probe = "disabled";
  let routerError: string | undefined;
  if (deps.hotspot) {
    try {
      await withTimeout(deps.hotspot.systemResource(), HEALTH_TIMEOUT_MS);
      router = "ok";
    } catch (error) {
      router = "down";
      routerError = isRouterOsUnavailable(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : "unknown error";
    }
  }

  const status: HealthReport["status"] =
    db === "down" ? "down" : router === "down" ? "degraded" : "ok";
  return { status, db, router, ...(routerError ? { routerError } : {}) };
};

/** DB failure is fatal (503); a router outage is reported but keeps us up so sales still queue. */
export const createHealthRoutes = (deps: WifiDeps) =>
  new Hono().get("/health", async (c) => {
    const report = await checkHealth(deps);
    return c.json(report, report.status === "down" ? 503 : 200);
  });
