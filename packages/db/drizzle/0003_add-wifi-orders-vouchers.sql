CREATE TABLE "wifi_order" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL,
	"plan_id" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"telegram_id" text,
	"mac" text,
	"ip" text,
	"login_url" text,
	"amount_kobo" integer NOT NULL,
	"paystack_reference" text NOT NULL,
	"paystack_status" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"router_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"fulfilled_at" timestamp,
	CONSTRAINT "wifi_order_paystack_reference_unique" UNIQUE("paystack_reference")
);
--> statement-breakpoint
CREATE TABLE "wifi_voucher" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"code" text NOT NULL,
	"profile" text NOT NULL,
	"ros_id" text,
	"limit_bytes_total" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wifi_voucher_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "wifi_voucher" ADD CONSTRAINT "wifi_voucher_order_id_wifi_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wifi_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wifi_order_status_idx" ON "wifi_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wifi_order_telegramId_idx" ON "wifi_order" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "wifi_order_createdAt_idx" ON "wifi_order" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wifi_voucher_orderId_idx" ON "wifi_voucher" USING btree ("order_id");