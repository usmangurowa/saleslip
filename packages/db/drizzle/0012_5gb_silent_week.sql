-- The ₦200/5 GB offer now runs a full week internally (profile
-- 1-Week-5GB, 7-day on-login expiry) with no duration listed
-- buyer-facing. The old day-5gb row is retired as-is — not overwritten —
-- so vouchers already sold on the 24-hour terms keep their historical
-- receipts and profile mapping; the week-backed offer launches under its
-- own id. Same retirement pattern as the duo plans.
UPDATE "wifi_plan" SET "active" = false, "updated_at" = now() WHERE "id" = 'day-5gb';
--> statement-breakpoint
INSERT INTO "wifi_plan" ("id", "name", "description", "price_kobo", "ros_profile", "data_limit_bytes", "validity_label", "active", "sort_order", "created_at", "updated_at") VALUES
  ('week-5gb', '5 GB Data', '5 GB of data on one device.', 20000, '1-Week-5GB', 5368709120, '', true, 1, now(), now())
ON CONFLICT ("id") DO NOTHING;
