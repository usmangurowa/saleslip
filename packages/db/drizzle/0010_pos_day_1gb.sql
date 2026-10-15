-- POS entry tier: ₦50 for 1 GB of data, 24-hour validity. Sits first on
-- the buy page; existing rows keep their relative order behind it.
UPDATE "wifi_plan" SET "sort_order" = "sort_order" + 1;
--> statement-breakpoint
INSERT INTO "wifi_plan" ("id", "name", "description", "price_kobo", "ros_profile", "data_limit_bytes", "validity_label", "active", "sort_order", "created_at", "updated_at") VALUES
  ('pos-1', '1 Day · 1 GB', '1 GB of data for 24 hours — right-sized for POS and light use.', 5000, '1-Day-1GB', 1073741824, '24 hours', true, 0, now(), now())
ON CONFLICT ("id") DO NOTHING;
