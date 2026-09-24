import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

import { authEnv } from "@turbo/auth/env";
import { shouldSkipEnvValidation } from "@turbo/shared/env";

/** Non-empty string, empty string, or missing var — only the first counts as set. */
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const flag = z
  .string()
  .optional()
  .transform((value) => value === "1" || value === "true");

export const env = createEnv({
  extends: [authEnv()],
  server: {
    SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    SERVER_URL: z.url().default("http://localhost:3001"),
    APP_URL: z.url().default("http://localhost:3000"),
    POSTGRES_URL: z.url(),
    RESEND_API_KEY: optionalString,

    // WiFi voucher shop (apps/server/src/wifi). Every value is optional so the
    // template still boots without a router or Paystack account; the shop
    // degrades to "not configured" responses instead.
    PUBLIC_BASE_URL: z.url().optional(),
    /** Web app origin used for buyer-facing links (e.g. Paystack callback). */
    WEB_APP_URL: z.url().optional(),
    BRAND_NAME: z.string().min(1).default("Saleslip Starlink"),
    SUPPORT_PHONE: optionalString,
    ROUTER_HOST: optionalString,
    ROUTER_PORT: z.coerce.number().int().min(1).max(65535).default(8728),
    ROUTER_API_USER: optionalString,
    ROUTER_API_PASSWORD: optionalString,
    ROUTER_DISABLED: flag,
    PAYSTACK_SECRET_KEY: optionalString,
    PAYSTACK_PUBLIC_KEY: optionalString,
    PAYSTACK_DISABLED: flag,
    TELEGRAM_BOT_TOKEN: optionalString,
    TELEGRAM_WEBHOOK_SECRET: optionalString,
    TELEGRAM_ADMIN_IDS: optionalString,
    WIFI_PROFILE_DAY_1: optionalString,
    WIFI_PROFILE_DAY_2: optionalString,
    WIFI_PROFILE_WEEK_1: optionalString,
    WIFI_PROFILE_WEEK_2: optionalString,
    WIFI_PROFILE_MONTH_1: optionalString,
    WIFI_PROFILE_MONTH_2: optionalString,
    WIFI_HOTSPOT_SERVER: optionalString,
    ADMIN_EMAILS: optionalString,
  },
  runtimeEnv: {
    ...process.env,
    SERVER_PORT: process.env.SERVER_PORT ?? process.env.PORT,
  },
  skipValidation: shouldSkipEnvValidation(),
});
