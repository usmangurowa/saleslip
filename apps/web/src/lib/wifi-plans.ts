import { asc, eq } from "drizzle-orm";

import { db } from "@turbo/db/client";
import { wifiPlan } from "@turbo/db";
import { buildPlans, type WifiPlan } from "@turbo/wifi";

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
    if (rows.length === 0) return buildPlans();
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
    return buildPlans();
  }
};
