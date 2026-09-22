import { Hono } from "hono";

import type { WifiDeps } from "../deps";

/**
 * Telegram webhook. The secret lives in the path so the bot can only be
 * driven by Telegram (which is the only party that knows the URL).
 */
export const createTelegramRoutes = (deps: WifiDeps) =>
  new Hono().post("/webhooks/telegram/:secret", async (c) => {
    const { telegramWebhook, config } = deps;
    if (!telegramWebhook || !config.telegramWebhookSecret) return c.notFound();
    if (c.req.param("secret") !== config.telegramWebhookSecret) {
      return c.notFound();
    }
    return telegramWebhook(c.req.raw);
  });
