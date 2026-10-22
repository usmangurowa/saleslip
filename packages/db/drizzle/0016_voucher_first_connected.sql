-- "New" badge on the attendance board: when a code was first seen in an
-- active hotspot session. Stamped once, alongside last_connected_at, and never
-- moved afterwards.
ALTER TABLE "wifi_voucher" ADD COLUMN "first_connected_at" timestamp;--> statement-breakpoint
-- Codes already used before this column existed are not new. Backfill them
-- from the earliest known time so the next stamp flags no returning customer.
UPDATE "wifi_voucher"
SET "first_connected_at" = coalesce("activated_at", "last_connected_at", "created_at")
WHERE "last_connected_at" IS NOT NULL OR "bytes_used" > 0;
