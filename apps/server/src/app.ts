import { Hono } from "hono";

import type { WifiRouterAppOptions } from "@turbo/api/wifi-router";
import type { Auth } from "@turbo/auth";
import { createApp } from "@turbo/api";
import { createWifiRouterApp } from "@turbo/api/wifi-router";
import { db } from "@turbo/db/client";

import type { WifiApp } from "./wifi/app";

type ServerAuth = Parameters<typeof createApp>[0] & Pick<Auth, "handler">;

interface CreateServerAppOptions {
  allowedOrigins: string[];
  rateLimit?: number;
  rateLimitWindow?: number;
  /** WiFi voucher shop mounted at the root; omitted in API-only tests. */
  wifi?: WifiApp;
  /**
   * Router-backed console, mounted at `/wifi-router`.
   *
   * Only this runtime mounts it: it is the only one with a WireGuard route to
   * the hotspot, and `auth`/`db` are supplied here. The web app reaches it
   * through the same-origin proxy in `apps/web/src/app/api/wifi-router`.
   */
  wifiRouter?: Omit<WifiRouterAppOptions, "auth" | "db">;
}

export const createServerApp = (
  auth: ServerAuth,
  {
    allowedOrigins,
    rateLimit = 100,
    rateLimitWindow = 60 * 1000,
    wifi,
    wifiRouter,
  }: CreateServerAppOptions,
) => {
  const apiApp = createApp(auth, db, {
    security: {
      allowedOrigins,
      rateLimit,
      rateLimitWindow,
    },
  });

  const app = new Hono()
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    // Registered before the `/api` mount so the more specific path wins.
    .route("/wifi-router", createWifiRouterApp({ auth, db, ...wifiRouter }))
    .route("/api", apiApp);

  if (wifi) {
    // The shop owns `/health` (db + router probes) when mounted.
    app.route("/", wifi);
  } else {
    app.get("/health", (c) => c.text("OK"));
  }

  return app;
};
