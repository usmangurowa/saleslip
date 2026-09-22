CREATE TABLE "wifi_voucher_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"plan_id" text NOT NULL,
	"profile" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wifi_voucher" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wifi_voucher" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "wifi_voucher" ADD COLUMN "channel" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
CREATE INDEX "wifi_voucher_batch_createdAt_idx" ON "wifi_voucher_batch" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "wifi_voucher" ADD CONSTRAINT "wifi_voucher_batch_id_wifi_voucher_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."wifi_voucher_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wifi_voucher_batchId_idx" ON "wifi_voucher" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "wifi_voucher" ADD CONSTRAINT "wifi_voucher_owner_check" CHECK (num_nonnulls("wifi_voucher"."order_id", "wifi_voucher"."batch_id") = 1);