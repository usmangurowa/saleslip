import type { Update, UserFromGetMe } from "grammy/types";
import { webhookCallback } from "grammy";
import { describe, expect, it } from "vitest";

import type { PaystackClient } from "@turbo/paystack";

import { createWifiApp } from "../app";
import {
  CALLBACK,
  createTelegramBot,
  createTelegramNotifier,
} from "../telegram/bot";
import { createFakeHotspot, createTestDeps } from "./helpers";

const botInfo: UserFromGetMe = {
  id: 42,
  is_bot: true,
  first_name: "Test",
  username: "test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

const ADMIN = 1;
const USER = 777;

const okPaystack: PaystackClient = {
  initializeTransaction: (input) =>
    Promise.resolve({
      status: "ok",
      data: {
        authorizationUrl: `https://checkout.paystack.test/${input.reference}`,
        accessCode: "ac",
        reference: input.reference,
      },
    }),
  verifyTransaction: () => Promise.reject(new Error("not used")),
};

/** Wires a bot whose outgoing API calls are captured instead of sent. */
const harness = (options: Parameters<typeof createTestDeps>[0] = {}) => {
  const t = createTestDeps({ paystack: okPaystack, ...options });
  const bot = createTelegramBot({ token: "123:token", deps: t.deps, botInfo });
  const sent: { method: string; payload: Record<string, unknown> }[] = [];
  bot.api.config.use((_prev, method, payload) => {
    sent.push({ method, payload });
    return Promise.resolve({ ok: true, result: true } as never);
  });
  let updateId = 0;
  const next = () => ++updateId;
  const text = (chatId: number, body: string) =>
    bot.handleUpdate({
      update_id: next(),
      message: {
        message_id: next(),
        date: 0,
        chat: { id: chatId, type: "private", first_name: "U" },
        from: { id: chatId, is_bot: false, first_name: "U" },
        text: body,
        entities: body.startsWith("/")
          ? [
              {
                type: "bot_command",
                offset: 0,
                length: body.split(" ")[0]?.length ?? 0,
              },
            ]
          : undefined,
      },
    });
  const callback = (chatId: number, data: string) =>
    bot.handleUpdate({
      update_id: next(),
      callback_query: {
        id: String(next()),
        from: { id: chatId, is_bot: false, first_name: "U" },
        chat_instance: "ci",
        data,
        message: {
          message_id: next(),
          date: 0,
          chat: { id: chatId, type: "private", first_name: "U" },
          text: "menu",
        },
      },
    });
  const replies = () =>
    sent.filter((s) => s.method === "sendMessage").map((s) => s.payload);
  return { ...t, bot, sent, text, callback, replies };
};

describe("telegram bot", () => {
  it("/start shows the main menu", async () => {
    const h = harness();
    await h.text(USER, "/start");
    const [reply] = h.replies();
    expect(reply?.text).toContain("Welcome to Test WiFi");
    const markup = reply?.reply_markup as {
      inline_keyboard: { callback_data: string }[][];
    };
    expect(markup.inline_keyboard.flat().map((b) => b.callback_data)).toEqual([
      CALLBACK.buy,
      CALLBACK.vouchers,
      CALLBACK.help,
    ]);
  });

  it("buy → plan creates a telegram order without contact details and sends the pay link", async () => {
    const h = harness();
    await h.callback(USER, CALLBACK.buy);
    expect(h.sent.some((s) => s.method === "answerCallbackQuery")).toBe(true);
    expect(h.replies().at(-1)?.text).toContain("Choose a plan");

    await h.callback(USER, CALLBACK.plan("day-1"));
    const order = [...h.orders.values()][0];
    expect(order).toMatchObject({
      channel: "telegram",
      telegramId: String(USER),
      planId: "day-1",
      status: "pending",
    });
    expect(order?.phone ?? null).toBeNull();
    const pay = h
      .replies()
      .find((r) => String(r.text).includes("Tap below to pay"));
    const markup = pay?.reply_markup as {
      inline_keyboard: { url: string }[][];
    };
    expect(markup.inline_keyboard[0]?.[0]?.url).toBe(
      `https://checkout.paystack.test/${order?.id ?? ""}`,
    );
  });

  it("plain text messages without an order fall back to the menu", async () => {
    const h = harness();
    await h.text(USER, "hello");
    expect(h.replies().at(-1)?.text).toContain("Welcome to Test WiFi");
    expect(h.orders.size).toBe(0);
  });

  it("DMs the code on fulfilment through the notifier", async () => {
    const fake = createFakeHotspot();
    const h = harness({ hotspot: fake.hotspot });
    h.deps.telegram = createTelegramNotifier(h.bot, h.deps.logger);
    await h.callback(USER, CALLBACK.plan("day-1"));
    const order = [...h.orders.values()][0];
    if (!order) throw new Error("no order");

    await h.fulfilment.handlePayment(order.id, "success");
    const voucher = await h.repo.getVoucherForOrder(order.id);
    await h.deps.telegram.sendMessage(
      String(USER),
      `code ${voucher?.code ?? ""}`,
    );
    expect(h.replies().at(-1)).toMatchObject({
      chat_id: String(USER),
      text: `code ${voucher?.code ?? ""}`,
    });

    await h.callback(USER, CALLBACK.vouchers);
    expect(h.replies().at(-1)?.text).toContain(`Code: ${voucher?.code ?? ""}`);
  });

  it("/status is owner-only and reports router + sales", async () => {
    const fake = createFakeHotspot();
    const h = harness({
      hotspot: fake.hotspot,
      telegramAdminIds: [String(ADMIN)],
    });
    await h.text(USER, "/status");
    expect(h.replies().at(-1)?.text).toContain("for the hotspot owner");

    await h.text(ADMIN, "/status");
    const status = String(h.replies().at(-1)?.text);
    expect(status).toContain("Today: 0 paid order(s), ₦0");
    expect(status).toContain("Active hotspot users: 0");
    expect(status).toContain("RouterOS");

    fake.state.fail = new Error("timeout");
    await h.text(ADMIN, "/status");
    expect(String(h.replies().at(-1)?.text)).toContain("unreachable");
  });

  it("webhook route only accepts the configured secret", async () => {
    const h = harness({ telegramWebhookSecret: "s3cret" });
    h.deps.telegramWebhook = webhookCallback(h.bot, "std/http");
    const app = createWifiApp(h.deps);
    const update: Update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: USER, type: "private", first_name: "U" },
        from: { id: USER, is_bot: false, first_name: "U" },
        text: "/start",
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    };
    const post = (secret: string) =>
      app.request(`/webhooks/telegram/${secret}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });

    expect((await post("wrong")).status).toBe(404);
    expect(h.replies()).toHaveLength(0);
    expect((await post("s3cret")).status).toBe(200);
    expect(h.replies().at(-1)?.text).toContain("Welcome");
  });
});
