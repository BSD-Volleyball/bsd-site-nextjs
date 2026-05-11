DROP INDEX "match_referees_match_idx";--> statement-breakpoint
ALTER TABLE "match_referees" ADD COLUMN "role" text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "match_referees_match_role_idx" ON "match_referees" USING btree ("match_id","role");