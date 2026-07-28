CREATE TABLE "notification_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"notification_type" text NOT NULL,
	"stream_id" text NOT NULL,
	"tag" text,
	"subject" text NOT NULL,
	"dedupe_key" text,
	"status" text NOT NULL,
	"postmark_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_optouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"notification_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_optouts" ADD CONSTRAINT "notification_optouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_dedupe_uniq" ON "notification_log" USING btree ("notification_type","dedupe_key","email") WHERE "notification_log"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_log_user_idx" ON "notification_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_log_created_at_idx" ON "notification_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_optouts_user_type_uniq" ON "notification_optouts" USING btree ("user_id","notification_type");--> statement-breakpoint
CREATE INDEX "notification_optouts_type_idx" ON "notification_optouts" USING btree ("notification_type");