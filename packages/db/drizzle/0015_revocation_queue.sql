-- Deferred router revocations: vouchers deleted from the console while the
-- router was unreachable. The server's revocation sweeper removes the hotspot
-- users once the router answers again.
CREATE TABLE "wifi_revocation_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"ros_id" text,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wifi_revocation_queue_createdAt_idx" ON "wifi_revocation_queue" USING btree ("created_at");
