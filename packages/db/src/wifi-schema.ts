import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const WIFI_ORDER_CHANNELS = ["web", "telegram"] as const;
export type WifiOrderChannel = (typeof WIFI_ORDER_CHANNELS)[number];

export const WIFI_ORDER_STATUSES = [
  "pending",
  "paid",
  "fulfilled",
  "pending_router",
  "failed",
] as const;
export type WifiOrderStatus = (typeof WIFI_ORDER_STATUSES)[number];

export const WIFI_VOUCHER_STATUSES = ["active", "revoked"] as const;
export type WifiVoucherStatus = (typeof WIFI_VOUCHER_STATUSES)[number];

export const wifiOrder = pgTable(
  "wifi_order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    channel: text("channel", { enum: WIFI_ORDER_CHANNELS })
      .default("web")
      .notNull(),
    planId: text("plan_id").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    telegramId: text("telegram_id"),
    mac: text("mac"),
    ip: text("ip"),
    loginUrl: text("login_url"),
    amountKobo: integer("amount_kobo").notNull(),
    paystackReference: text("paystack_reference").notNull().unique(),
    paystackStatus: text("paystack_status"),
    status: text("status", { enum: WIFI_ORDER_STATUSES })
      .default("pending")
      .notNull(),
    /** Router fulfilment attempts so far; drives the retry backoff. */
    routerAttempts: integer("router_attempts").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    paidAt: timestamp("paid_at"),
    fulfilledAt: timestamp("fulfilled_at"),
  },
  (table) => [
    index("wifi_order_status_idx").on(table.status),
    index("wifi_order_telegramId_idx").on(table.telegramId),
    index("wifi_order_createdAt_idx").on(table.createdAt),
  ],
);

export const wifiVoucher = pgTable(
  "wifi_voucher",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => wifiOrder.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    profile: text("profile").notNull(),
    rosId: text("ros_id"),
    limitBytesTotal: bigint("limit_bytes_total", { mode: "number" }),
    status: text("status", { enum: WIFI_VOUCHER_STATUSES })
      .default("active")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("wifi_voucher_orderId_idx").on(table.orderId)],
);
