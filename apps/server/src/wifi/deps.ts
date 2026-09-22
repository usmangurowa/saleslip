import type { PaystackClient } from "@turbo/paystack";
import type { HotspotService } from "@turbo/routeros";

import type { FulfilmentService } from "./fulfilment";
import type { Logger } from "./logger";
import type { OrderRepository } from "./orders";
import type { WifiPlan } from "./plans";

export interface WifiConfig {
  brandName: string;
  supportPhone?: string;
  /** Public origin for Paystack callbacks and Telegram links, no trailing slash. */
  publicBaseUrl?: string;
  paystackSecretKey?: string;
  paystackPublicKey?: string;
  telegramWebhookSecret?: string;
  telegramAdminIds: readonly string[];
  hotspotServer?: string;
  timeZone?: string;
}

export interface TelegramNotifier {
  /** Send a plain-text message to a chat; never throws. */
  sendMessage: (chatId: string, text: string) => Promise<void>;
}

/** Everything the HTTP layer needs; tests construct it with fakes. */
export interface WifiDeps {
  config: WifiConfig;
  plans: readonly WifiPlan[];
  repo: OrderRepository;
  paystack: PaystackClient | undefined;
  hotspot: HotspotService | undefined;
  fulfilment: FulfilmentService;
  logger: Logger;
  telegram?: TelegramNotifier;
  /** Handles a raw Telegram update request; set when the bot is configured. */
  telegramWebhook?: (request: Request) => Promise<Response>;
  /** DB liveness probe for `/health`. */
  pingDb: () => Promise<void>;
  now?: () => Date;
}
