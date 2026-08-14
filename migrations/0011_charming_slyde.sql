ALTER TABLE "discounts" ADD COLUMN "used_at" timestamp;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "used_signup_id" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_used_signup_id_signups_id_fk" FOREIGN KEY ("used_signup_id") REFERENCES "public"."signups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discounts_used_signup_idx" ON "discounts" USING btree ("used_signup_id");