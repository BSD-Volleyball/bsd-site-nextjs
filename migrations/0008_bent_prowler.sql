ALTER TABLE "notification_log" ADD COLUMN "mode" text DEFAULT 'notification' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "broadcast_id" integer;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_broadcast_id_email_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."email_broadcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_log_email_idx" ON "notification_log" USING btree ("email");--> statement-breakpoint
CREATE INDEX "notification_log_broadcast_idx" ON "notification_log" USING btree ("broadcast_id");