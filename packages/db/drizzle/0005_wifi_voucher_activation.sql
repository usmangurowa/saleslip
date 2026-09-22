ALTER TABLE "wifi_voucher" ADD COLUMN "activated_at" timestamp;--> statement-breakpoint
ALTER TABLE "wifi_voucher" ADD COLUMN "bytes_used" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wifi_voucher" ADD COLUMN "synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "wifi_voucher" ADD COLUMN "last_error" text;