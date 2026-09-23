import { sql } from "drizzle-orm";
import { webhookCallback } from "grammy";

import { db } from "@turbo/db/client";
import { createPaystackClient } from "@turbo/paystack";
import { createHotspotService, createRouterOsClient } from "@turbo/routeros";
import { buildPlans } from "@turbo/wifi";

import type { env as ServerEnv } from "../env";
import type { WifiDeps } from "./deps";
import { createFulfilmentService } from "./fulfilment";
import { createLogger } from "./logger";
import { createOrderRepository } from "./orders";
import { createRouterWatchdog } from "./router-watchdog";
import {
  createTelegramBot,
  createTelegramNotifier,
  telegramWebhookPath,
} from "./telegram/bot";

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
export interface WifiRuntime {
  deps: WifiDeps;
  /** Best-effort boot tasks: webhook registration, watchdog, retry sweep. */
  start: () => Promise<void>;
  stop: () => void;
}

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
    day1: env.WIFI_PROFILE_DAY_1,
    day2: env.WIFI_PROFILE_DAY_2,
    week1: env.WIFI_PROFILE_WEEK_1,
    week2: env.WIFI_PROFILE_WEEK_2,
    month1: env.WIFI_PROFILE_MONTH_1,
    month2: env.WIFI_PROFILE_MONTH_2,
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
      hotspotServer: env.WIFI_HOTSPOT_SERVER,
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
          const bonus = await repo.getBonusVoucherForOrder(order.id);
          await deps.telegram.sendMessage(
            order.telegramId,
            [
              `✅ Payment received. Your WiFi code:`,
              ``,
              voucher.code,
              ``,
              `Join the ${env.BRAND_NAME} WiFi, open the login page and enter the code as both username and password.`,
              ...(bonus
                ? [
                    ``,
                    `Bonus code for 5 free minutes when your data finishes:`,
                    ``,
                    bonus.code,
                  ]
                : []),
            ].join("\n"),
          );
        }
      },
    }),
  };

  return deps;
};

/**
 * Wires the optional Telegram bot and router watchdog onto the deps and
 * returns the boot hooks `index.ts` runs once the HTTP server is listening.
 */
export const createWifiRuntime = (env: WifiEnv): WifiRuntime => {
  const deps = createWifiDeps(env);
  const { logger, config } = deps;
  const stops: (() => void)[] = [() => deps.fulfilment.stop()];
  const boot: (() => Promise<unknown>)[] = [() => deps.fulfilment.sweep()];

  if (env.TELEGRAM_BOT_TOKEN && config.telegramWebhookSecret) {
    const bot = createTelegramBot({ token: env.TELEGRAM_BOT_TOKEN, deps });
    deps.telegram = createTelegramNotifier(
      bot,
      logger.child({ component: "telegram" }),
    );
    deps.telegramWebhook = webhookCallback(bot, "std/http");

    if (config.publicBaseUrl) {
      const url = `${config.publicBaseUrl}${telegramWebhookPath(config.telegramWebhookSecret)}`;
      boot.push(async () => {
        try {
          await bot.api.setWebhook(url, { drop_pending_updates: false });
          logger.info("telegram webhook registered");
        } catch (error) {
          logger.error("telegram setWebhook failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    } else {
      logger.warn("telegram webhook not registered", {
        reason: "PUBLIC_BASE_URL unset",
      });
    }

    if (deps.hotspot && config.telegramAdminIds.length > 0) {
      const notifier = deps.telegram;
      const watchdog = createRouterWatchdog({
        hotspot: deps.hotspot,
        logger: logger.child({ component: "watchdog" }),
        notify: async (text) => {
          await Promise.all(
            config.telegramAdminIds.map((id) => notifier.sendMessage(id, text)),
          );
        },
      });
      boot.push(() => {
        watchdog.start();
        return Promise.resolve();
      });
      stops.push(() => watchdog.stop());
    }
  } else {
    logger.warn("telegram bot disabled", { reason: "not configured" });
  }

  return {
    deps,
    start: async () => {
      for (const task of boot) await task();
    },
    stop: () => {
      for (const stop of stops) stop();
    },
  };
};
