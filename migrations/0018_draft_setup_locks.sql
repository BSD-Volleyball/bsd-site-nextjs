ALTER TABLE "individual_divisions" ADD COLUMN "draft_rounds_locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD COLUMN "draft_rounds_locked_by" text;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD COLUMN "draft_order_locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD COLUMN "draft_order_locked_by" text;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD CONSTRAINT "individual_divisions_draft_rounds_locked_by_users_id_fk" FOREIGN KEY ("draft_rounds_locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD CONSTRAINT "individual_divisions_draft_order_locked_by_users_id_fk" FOREIGN KEY ("draft_order_locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;