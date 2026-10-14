import { asc, eq } from "drizzle-orm";

import type { WifiPlan } from "@turbo/wifi";
import { wifiPlan } from "@turbo/db";
import { db } from "@turbo/db/client";
import { buildPlans, sellablePlans } from "@turbo/wifi";

/**
 * The purchasable plan catalogue for the shop: DB rows first, env-seeded
 * `buildPlans()` when the table is empty or unreachable — mirrors the server
 * runtime's `loadPlans`, so the shop always shows what can actually be
 * fulfilled.
 */
export const loadShopPlans = async (): Promise<readonly WifiPlan[]> => {
  try {
    const rows = await db
      .select()
      .from(wifiPlan)
      .where(eq(wifiPlan.active, true))
      .orderBy(asc(wifiPlan.sortOrder), asc(wifiPlan.id));
    if (rows.length === 0) return sellablePlans(buildPlans());
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceKobo: row.priceKobo,
      rosProfile: row.rosProfile,
      ...(row.dataLimitBytes !== null
        ? { dataLimitBytes: row.dataLimitBytes }
        : {}),
      ...(row.uptimeLimit !== null ? { uptimeLimit: row.uptimeLimit } : {}),
      validityLabel: row.validityLabel,
    }));
  } catch {
    return sellablePlans(buildPlans());
  }
};
