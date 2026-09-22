import { hc } from "hono/client";

import type { WifiRouterAppType } from "../router/wifi-router";

/**
 * Same-origin base path the web console proxies to `apps/server`.
 *
 * A static segment on purpose: it must resolve ahead of the Next app's
 * optional catch-all at `/api/[[...route]]`.
 */
export const WIFI_ROUTER_BASE_PATH = "/api/wifi-router";

/**
 * Typed client for the router-backed console.
 *
 * The web app can only reach these routes through the same-origin proxy, so
 * pass an absolute origin (e.g. `window.location.origin`).
 */
export const createWifiRouterClient = (baseUrl: string) =>
  hc<WifiRouterAppType>(`${baseUrl}${WIFI_ROUTER_BASE_PATH}`);

export type WifiRouterClient = ReturnType<typeof createWifiRouterClient>;
