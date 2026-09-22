import { Hono } from "hono";

import type { Auth } from "@turbo/auth";
import { createApp } from "@turbo/api";
import { db } from "@turbo/db/client";

import type { WifiApp } from "./wifi/app";

type ServerAuth = Parameters<typeof createApp>[0] & Pick<Auth, "handler">;

interface CreateServerAppOptions {
  allowedOrigins: string[];
  rateLimit?: number;
  rateLimitWindow?: number;
  /** WiFi voucher shop mounted at the root; omitted in API-only tests. */
  wifi?: WifiApp;
}

export const createServerApp = (
  auth: ServerAuth,
  {
    allowedOrigins,
    rateLimit = 100,
    rateLimitWindow = 60 * 1000,
    wifi,
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
    .route("/api", apiApp);

  if (wifi) {
    // The shop owns `/health` (db + router probes) when mounted.
    app.route("/", wifi);
  } else {
    app.get("/health", (c) => c.text("OK"));
  }

  return app;
};
