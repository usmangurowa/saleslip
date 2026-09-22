import { sql } from "drizzle-orm";

import { db } from "@turbo/db/client";
import { createPaystackClient } from "@turbo/paystack";
import { createHotspotService, createRouterOsClient } from "@turbo/routeros";

import type { env as ServerEnv } from "../env";
import type { WifiDeps } from "./deps";
import { createFulfilmentService } from "./fulfilment";
import { createLogger } from "./logger";
import { createOrderRepository } from "./orders";
import { buildPlans } from "./plans";

type WifiEnv = typeof ServerEnv;

export const parseAdminIds = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));

/**
 * Builds the production dependency graph from validated env. Anything not
 * configured is left `undefined` and the routes degrade gracefully.
 */
export const createWifiDeps = (env: WifiEnv): WifiDeps => {
  const logger = createLogger({ service: "wifi" });

  const hotspot =
    !env.ROUTER_DISABLED &&
    env.ROUTER_HOST &&
    env.ROUTER_API_USER &&
    env.ROUTER_API_PASSWORD
      ? createHotspotService(
          createRouterOsClient({
            host: env.ROUTER_HOST,
            port: env.ROUTER_PORT,
            user: env.ROUTER_API_USER,
            password: env.ROUTER_API_PASSWORD,
          }),
        )
      : undefined;
  if (!hotspot)
    logger.warn("router integration disabled", { reason: "not configured" });

  const paystack =
    !env.PAYSTACK_DISABLED && env.PAYSTACK_SECRET_KEY
      ? createPaystackClient({ secretKey: env.PAYSTACK_SECRET_KEY })
      : undefined;
  if (!paystack) logger.warn("paystack disabled", { reason: "not configured" });

  const plans = buildPlans({
    dailyUnlimited: env.WIFI_PROFILE_DAILY_UNLIMITED,
    daily1gb: env.WIFI_PROFILE_DAILY_1GB,
    weekly5gb: env.WIFI_PROFILE_WEEKLY_5GB,
  });

  const repo = createOrderRepository(db);
  const deps: WifiDeps = {
    config: {
      brandName: env.BRAND_NAME,
      supportPhone: env.SUPPORT_PHONE,
      publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/+$/, ""),
      paystackSecretKey: env.PAYSTACK_SECRET_KEY,
      paystackPublicKey: env.PAYSTACK_PUBLIC_KEY,
      telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
      telegramAdminIds: parseAdminIds(env.TELEGRAM_ADMIN_IDS),
      timeZone: "Africa/Lagos",
    },
    plans,
    repo,
    paystack,
    hotspot,
    logger,
    pingDb: async () => {
      await db.execute(sql`select 1`);
    },
    fulfilment: createFulfilmentService({
      repo,
      plans,
      hotspot,
      logger: logger.child({ component: "fulfilment" }),
      onFulfilled: async (order, voucher) => {
        if (order.channel === "telegram" && order.telegramId && deps.telegram) {
          await deps.telegram.sendMessage(
            order.telegramId,
            [
              `✅ Payment received. Your WiFi code:`,
              ``,
              voucher.code,
              ``,
              `Join the ${env.BRAND_NAME} WiFi, open the login page and enter the code as both username and password.`,
            ].join("\n"),
          );
        }
      },
    }),
  };

  return deps;
};
