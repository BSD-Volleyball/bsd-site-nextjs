DROP INDEX "discounts_used_signup_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_used_signup_uniq" ON "discounts" USING btree ("used_signup_id");