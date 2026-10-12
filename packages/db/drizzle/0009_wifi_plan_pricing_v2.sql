-- Market pricing: ₦500 / ₦2,000 / ₦5,000 for single-device plans.
-- Duo plans are deactivated, not deleted, so vouchers already sold on their
-- profiles still resolve and they can be re-enabled from the console.
UPDATE "wifi_plan" SET "price_kobo" = 50000, "updated_at" = now() WHERE "id" = 'day-1';
--> statement-breakpoint
UPDATE "wifi_plan" SET "price_kobo" = 200000, "updated_at" = now() WHERE "id" = 'week-1';
--> statement-breakpoint
UPDATE "wifi_plan" SET "price_kobo" = 500000, "updated_at" = now() WHERE "id" = 'month-1';
--> statement-breakpoint
UPDATE "wifi_plan" SET "active" = false, "updated_at" = now() WHERE "id" IN ('day-2', 'week-2', 'month-2');
