import type { Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { Bot, InlineKeyboard, Keyboard } from "grammy";

import type { WifiPlan } from "@turbo/wifi";
import { isRouterOsUnavailable } from "@turbo/routeros";
import { findPlan, formatData, formatNaira } from "@turbo/wifi";

import type { TelegramNotifier, WifiDeps } from "../deps";
import type { WifiOrderRecord } from "../orders";
import { startCheckout } from "../checkout";
import { phoneSchema } from "../routes/shop";

export interface TelegramBotOptions {
  token: string;
  deps: WifiDeps;
  /** Pre-supplied bot identity so tests skip the `getMe` round trip. */
  botInfo?: UserFromGetMe;
}

interface AwaitingPhone {
  step: "await_phone";
  planId: string;
}

export const CALLBACK = {
  buy: "buy",
  vouchers: "vouchers",
  help: "help",
  plan: (id: string) => `plan:${id}`,
} as const;

const mainMenu = () =>
  new InlineKeyboard()
    .text("🛒 Buy WiFi", CALLBACK.buy)
    .row()
    .text("🎟 My vouchers", CALLBACK.vouchers)
    .text("❓ Help", CALLBACK.help);

const planMenu = (plans: readonly WifiPlan[]) => {
  const keyboard = new InlineKeyboard();
  for (const plan of plans) {
    keyboard
      .text(
        `${plan.name} — ${formatNaira(plan.priceKobo)}`,
        CALLBACK.plan(plan.id),
      )
      .row();
  }
  return keyboard;
};

const planLine = (plan: WifiPlan) =>
  `• ${plan.name} — ${formatNaira(plan.priceKobo)} (${formatData(plan.dataLimitBytes)}, ${plan.validityLabel})`;

export const connectInstructions = (brandName: string, supportPhone?: string) =>
  [
    `How to connect to ${brandName} WiFi:`,
    `1. Join the WiFi network on your phone or laptop.`,
    `2. Open any website; the login page appears.`,
    `3. Enter your voucher code as both username and password.`,
    supportPhone ? `\nNeed help? Call or WhatsApp ${supportPhone}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

const describeOrder = (
  order: WifiOrderRecord,
  plan: WifiPlan | undefined,
  code: string | undefined,
  timeZone: string | undefined,
) => {
  const when = order.createdAt.toLocaleString("en-NG", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const label = plan?.name ?? order.planId;
  switch (order.status) {
    case "fulfilled":
      return `${when} · ${label}\nCode: ${code ?? "—"}`;
    case "paid":
    case "pending_router":
      return `${when} · ${label}\nPaid — voucher is being created, you will get it here shortly.`;
    case "pending":
      return `${when} · ${label}\nAwaiting payment.`;
    case "failed":
      return `${when} · ${label}\nFailed.`;
  }
};

const isAdmin = (deps: WifiDeps, ctx: Context) => {
  const id = ctx.from?.id;
  return id !== undefined && deps.config.telegramAdminIds.includes(String(id));
};

/**
 * Buy-flow bot. Conversation state lives in memory keyed by chat id; the only
 * multi-step interaction is "pick a plan → send a phone number", which is
 * cheap to lose across restarts.
 */
export const createTelegramBot = ({
  token,
  deps,
  botInfo,
}: TelegramBotOptions) => {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);
  const { config, repo, logger } = deps;
  const pending = new Map<number, AwaitingPhone>();

  const showMenu = (ctx: Context) =>
    ctx.reply(
      `Welcome to ${config.brandName} WiFi.\nBuy a voucher in a minute — pay by transfer, USSD or card.`,
      { reply_markup: mainMenu() },
    );

  const showPlans = async (ctx: Context) => {
    const plans = await deps.plans();
    await ctx.reply(["Choose a plan:", "", ...plans.map(planLine)].join("\n"), {
      reply_markup: planMenu(plans),
    });
  };

  const askPhone = async (ctx: Context, planId: string) => {
    const chatId = ctx.chat?.id;
    const plan = findPlan(await deps.plans(), planId);
    if (chatId === undefined || !plan) {
      await ctx.reply("That plan is no longer available.");
      return;
    }
    pending.set(chatId, { step: "await_phone", planId });
    await ctx.reply(
      `${plan.name} — ${formatNaira(plan.priceKobo)}.\nSend the phone number for this voucher (e.g. 08012345678), or tap the button to share your number.`,
      {
        reply_markup: new Keyboard()
          .requestContact("📱 Share my number")
          .oneTime()
          .resized(),
      },
    );
  };

  const completeOrder = async (
    ctx: Context,
    planId: string,
    rawPhone: string,
  ) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const phone = phoneSchema.safeParse(rawPhone);
    if (!phone.success) {
      await ctx.reply(
        "That does not look like a Nigerian phone number. Try again, e.g. 08012345678.",
      );
      return;
    }
    pending.delete(chatId);

    const result = await startCheckout(deps, {
      channel: "telegram",
      planId,
      phone: phone.data,
      telegramId: String(chatId),
    });

    if (!result.ok) {
      const message =
        result.reason === "unknown_plan"
          ? "That plan is no longer available."
          : result.reason === "payments_unavailable"
            ? "Payments are temporarily unavailable. Please try again later."
            : "We could not start the payment. Please try again.";
      await ctx.reply(message, { reply_markup: { remove_keyboard: true } });
      return;
    }

    await ctx.reply(
      [
        `Order for ${result.plan.name} (${formatNaira(result.plan.priceKobo)}).`,
        `Tap below to pay. Your code arrives here as soon as payment is confirmed.`,
        ``,
        `Order ref: ${result.order.id.slice(0, 8)}`,
      ].join("\n"),
      {
        reply_markup: new InlineKeyboard().url(
          `💳 Pay ${formatNaira(result.plan.priceKobo)}`,
          result.authorizationUrl,
        ),
      },
    );
    await ctx.reply("Waiting for your payment…", {
      reply_markup: { remove_keyboard: true },
    });
  };

  const showVouchers = async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const orders = await repo.listOrdersForTelegram(String(chatId), 5);
    if (orders.length === 0) {
      await ctx.reply("You have no vouchers yet.", {
        reply_markup: mainMenu(),
      });
      return;
    }
    const lines = await Promise.all(
      orders.map(async (order) => {
        const voucher =
          order.status === "fulfilled"
            ? await repo.getVoucherForOrder(order.id)
            : undefined;
        return describeOrder(
          order,
          findPlan(await deps.plans(), order.planId),
          voucher?.code,
          config.timeZone,
        );
      }),
    );
    await ctx.reply(["Your recent vouchers:", "", ...lines].join("\n\n"));
  };

  const showStatus = async (ctx: Context) => {
    if (!isAdmin(deps, ctx)) {
      await ctx.reply("This command is for the hotspot owner.");
      return;
    }
    const summary = await repo.todaySummary(deps.now?.());
    const lines = [
      `📊 ${config.brandName} status`,
      `Today: ${summary.paidOrders} paid order(s), ${formatNaira(summary.revenueKobo)}`,
    ];
    if (!deps.hotspot) {
      lines.push("Router: integration disabled");
    } else {
      try {
        const [resource, active] = await Promise.all([
          deps.hotspot.systemResource(),
          deps.hotspot.listActive(),
        ]);
        lines.push(
          `Router: ${resource.boardName ?? "?"} · RouterOS ${resource.version ?? "?"}`,
          `Uptime: ${resource.uptime ?? "?"} · CPU ${resource.cpuLoad ?? "?"}%`,
          `Memory free: ${resource.freeMemory !== undefined ? `${Math.round(resource.freeMemory / 1_048_576)} MB` : "?"}`,
          `Active hotspot users: ${active.length}`,
        );
      } catch (error) {
        lines.push(
          `Router: ⚠️ unreachable (${error instanceof Error ? error.message : String(error)})`,
        );
        if (!isRouterOsUnavailable(error)) {
          logger.error("status command failed", { error: String(error) });
        }
      }
    }
    await ctx.reply(lines.join("\n"));
  };

  bot.command("start", showMenu);
  bot.command("buy", showPlans);
  bot.command("vouchers", showVouchers);
  bot.command("help", (ctx) =>
    ctx.reply(connectInstructions(config.brandName, config.supportPhone)),
  );
  bot.command("status", showStatus);

  bot.callbackQuery(CALLBACK.buy, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPlans(ctx);
  });
  bot.callbackQuery(CALLBACK.vouchers, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showVouchers(ctx);
  });
  bot.callbackQuery(CALLBACK.help, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(connectInstructions(config.brandName, config.supportPhone));
  });
  bot.callbackQuery(/^plan:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await askPhone(ctx, ctx.match[1] ?? "");
  });

  bot.on("message:contact", async (ctx) => {
    const state = pending.get(ctx.chat.id);
    if (!state) return showMenu(ctx);
    await completeOrder(ctx, state.planId, ctx.message.contact.phone_number);
  });

  bot.on("message:text", async (ctx) => {
    const state = pending.get(ctx.chat.id);
    if (!state) return showMenu(ctx);
    await completeOrder(ctx, state.planId, ctx.message.text);
  });

  bot.catch((error) => {
    logger.error("telegram update failed", {
      updateId: error.ctx.update.update_id,
      error: error.message,
    });
  });

  return bot;
};

export type TelegramBot = ReturnType<typeof createTelegramBot>;

/** Fire-and-forget DM helper used by fulfilment and the router watchdog. */
export const createTelegramNotifier = (
  bot: TelegramBot,
  logger: WifiDeps["logger"],
): TelegramNotifier => ({
  sendMessage: async (chatId, text) => {
    try {
      await bot.api.sendMessage(chatId, text);
    } catch (error) {
      logger.error("telegram send failed", {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

export const telegramWebhookPath = (secret: string) =>
  `/webhooks/telegram/${encodeURIComponent(secret)}`;
