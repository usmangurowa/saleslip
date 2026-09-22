import { buildPlans } from "@turbo/wifi";

/**
 * The plan catalogue, resolved from the same `WIFI_PROFILE_*` variables both
 * runtimes receive — the console and the shop must agree on RouterOS profile
 * names or a printed code would reference a profile that does not exist.
 *
 * Reading `process.env` directly matches how this package already handles
 * optional env (`router/support.ts`) and avoids threading config through
 * `createApp`.
 */
export const resolvePlans = () =>
  buildPlans({
    dailyUnlimited: process.env.WIFI_PROFILE_DAILY_UNLIMITED,
    daily1gb: process.env.WIFI_PROFILE_DAILY_1GB,
    weekly5gb: process.env.WIFI_PROFILE_WEEKLY_5GB,
  });

/**
 * Hotspot server name for routers running more than one (per-area setup).
 * Undefined (or blank) means "all", which is what a single-server router wants —
 * a blank name reaches `HotspotUserInput` and is ignored there.
 */
export const resolveHotspotServer = (): string | undefined =>
  process.env.WIFI_HOTSPOT_SERVER ?? undefined;
