import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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

/**
 * How a voucher came to exist. `manual` marks counter sales minted from the
 * admin console, which have no order and therefore no Paystack revenue.
 */
export const WIFI_VOUCHER_CHANNELS = ["web", "telegram", "manual"] as const;
export type WifiVoucherChannel = (typeof WIFI_VOUCHER_CHANNELS)[number];

/**
 * Whether a voucher is the paid plan the customer bought (`primary`) or a
 * single-use ~5-minute bonus (`bonus`). Bonus vouchers are no longer minted —
 * the daily router trial covers getting back online — but the kind is kept
 * for historical rows.
 */
export const WIFI_VOUCHER_KINDS = ["primary", "bonus"] as const;
export type WifiVoucherKind = (typeof WIFI_VOUCHER_KINDS)[number];

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
    phone: text("phone"),
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

/** One console minting action, so a printed sheet stays traceable. */
export const wifiVoucherBatch = pgTable(
  "wifi_voucher_batch",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    label: text("label").notNull(),
    planId: text("plan_id").notNull(),
    profile: text("profile").notNull(),
    quantity: integer("quantity").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("wifi_voucher_batch_createdAt_idx").on(table.createdAt)],
);

export const wifiVoucher = pgTable(
  "wifi_voucher",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /**
     * Null for counter sales. A voucher belongs to either an order or a batch,
     * never both — enforced by `wifi_voucher_owner_check`.
     */
    orderId: text("order_id").references(() => wifiOrder.id, {
      onDelete: "cascade",
    }),
    batchId: text("batch_id").references(() => wifiVoucherBatch.id, {
      onDelete: "cascade",
    }),
    code: text("code").notNull().unique(),
    profile: text("profile").notNull(),
    /** Paid plan voucher vs the retired bonus kind — see `WIFI_VOUCHER_KINDS`. */
    kind: text("kind", { enum: WIFI_VOUCHER_KINDS })
      .default("primary")
      .notNull(),
    /**
     * RouterOS hotspot user `.id`. The console revokes by id rather than by
     * name so a stale code cannot silently resolve to a different user.
     */
    rosId: text("ros_id"),
    /** Set when the router accepted the hotspot user. Null means not live. */
    activatedAt: timestamp("activated_at"),
    /**
     * Bytes-in + bytes-out as last read from the router. Snapshotted by
     * `/sessions/sync`, never streamed.
     */
    bytesUsed: bigint("bytes_used", { mode: "number" }).default(0).notNull(),
    syncedAt: timestamp("synced_at"),
    lastError: text("last_error"),
    limitBytesTotal: bigint("limit_bytes_total", { mode: "number" }),
    status: text("status", { enum: WIFI_VOUCHER_STATUSES })
      .default("active")
      .notNull(),
    channel: text("channel", { enum: WIFI_VOUCHER_CHANNELS })
      .default("web")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("wifi_voucher_orderId_idx").on(table.orderId),
    index("wifi_voucher_batchId_idx").on(table.batchId),
    check(
      "wifi_voucher_owner_check",
      sql`num_nonnulls(${table.orderId}, ${table.batchId}) = 1`,
    ),
  ],
);

/**
 * The sellable plan catalogue. Rows here feed `/buy`, checkout, and voucher
 * minting — adding one makes it sellable immediately, no deploy. `rosProfile`
 * is the RouterOS hotspot profile codes are minted against, matching a name on
 * the router (manage those from the Profiles tab).
 *
 * Deactivation is soft (`active = false`) so historical orders and vouchers
 * keep resolving to their plan.
 */
export const wifiPlan = pgTable(
  "wifi_plan",
  {
    /** Authored slug, e.g. `day-1` — referenced by orders and batches. */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    priceKobo: integer("price_kobo").notNull(),
    rosProfile: text("ros_profile").notNull(),
    dataLimitBytes: bigint("data_limit_bytes", { mode: "number" }),
    uptimeLimit: text("uptime_limit"),
    validityLabel: text("validity_label").notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("wifi_plan_price_check", sql`${table.priceKobo} >= 0`),
  ],
);
