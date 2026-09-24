CREATE TABLE "wifi_plan" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "price_kobo" integer NOT NULL,
  "ros_profile" text NOT NULL,
  "data_limit_bytes" bigint,
  "uptime_limit" text,
  "validity_label" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "wifi_plan_price_check" CHECK ("wifi_plan"."price_kobo" >= 0)
);
--> statement-breakpoint
-- Seed with the production RouterOS profile names so minting keeps working
-- the moment this table takes over from the WIFI_PROFILE_* env fallback.
INSERT INTO "wifi_plan" ("id", "name", "description", "price_kobo", "ros_profile", "validity_label", "sort_order") VALUES
  ('day-1',   '1 Day · 1 Device',   'Unlimited data for 24 hours on one device.',       100000, '1-Day-Unlimited',    '24 hours', 0),
  ('day-2',   '1 Day · 2 Devices',  'Unlimited data for 24 hours on up to two devices.',150000, 'Duo-1-Day',          '24 hours', 1),
  ('week-1',  '1 Week · 1 Device',  'Unlimited data for 7 days on one device.',         300000, '1-Week-Unlimited',   '7 days',   2),
  ('week-2',  '1 Week · 2 Devices', 'Unlimited data for 7 days on up to two devices.',  400000, 'Duo-1-Week',         '7 days',   3),
  ('month-1', '1 Month · 1 Device', 'Unlimited data for 30 days on one device.',        600000, '1-Month-Unlimited',  '30 days',  4),
  ('month-2', '1 Month · 2 Devices','Unlimited data for 30 days on up to two devices.', 800000, 'Duo-1-Month',        '30 days',  5)
ON CONFLICT ("id") DO NOTHING;
