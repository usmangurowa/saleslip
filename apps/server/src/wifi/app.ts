import { Hono } from "hono";

import type { WifiDeps } from "./deps";
import { createHealthRoutes } from "./routes/health";
import { createPaystackRoutes } from "./routes/paystack";
import { createShopRoutes } from "./routes/shop";

/**
 * Mounts every WiFi-shop route at the root of the given deps. Pure over its
 * inputs so tests can drive it with in-memory fakes.
 */
export const createWifiApp = (deps: WifiDeps) =>
  new Hono()
    .route("/", createHealthRoutes(deps))
    .route("/", createPaystackRoutes(deps))
    .route("/", createShopRoutes(deps));

export type WifiApp = ReturnType<typeof createWifiApp>;
