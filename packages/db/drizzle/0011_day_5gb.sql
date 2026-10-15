-- Mid data tier: ₦200 for 5 GB, 24-hour validity. Sits right after the ₦50
-- POS tier; every row behind it shifts down one place.
UPDATE "wifi_plan" SET "sort_order" = "sort_order" + 1 WHERE "sort_order" >= 1;
--> statement-breakpoint
INSERT INTO "wifi_plan" ("id", "name", "description", "price_kobo", "ros_profile", "data_limit_bytes", "validity_label", "active", "sort_order", "created_at", "updated_at") VALUES
  ('day-5gb', '1 Day · 5 GB', '5 GB of data for 24 hours on one device.', 20000, '1-Day-5GB', 5368709120, '24 hours', true, 1, now(), now())
ON CONFLICT ("id") DO NOTHING;
