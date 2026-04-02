-- Rename player_unavailability to user_unavailability and add user_id column
-- so refs without player signups can also track their availability.

ALTER TABLE "player_unavailability" RENAME TO "user_unavailability";
--> statement-breakpoint

-- Add user_id column (nullable initially so we can backfill)
ALTER TABLE "user_unavailability" ADD COLUMN "user_id" text;
--> statement-breakpoint

-- Backfill user_id from signups for all existing rows
UPDATE "user_unavailability"
SET "user_id" = s."player"
FROM "signups" s
WHERE s."id" = "user_unavailability"."signup_id";
--> statement-breakpoint

-- Make user_id required now that it's populated
ALTER TABLE "user_unavailability" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint

-- Add FK constraint for user_id
ALTER TABLE "user_unavailability" ADD CONSTRAINT "user_unavailability_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Make signup_id nullable (refs without signups won't have one)
ALTER TABLE "user_unavailability" ALTER COLUMN "signup_id" DROP NOT NULL;
--> statement-breakpoint

-- Drop old indexes
DROP INDEX IF EXISTS "player_unavailability_signup_event_unique";
DROP INDEX IF EXISTS "player_unavailability_signup_idx";
DROP INDEX IF EXISTS "player_unavailability_event_idx";
--> statement-breakpoint

-- Create new indexes on user_id
CREATE UNIQUE INDEX "user_unavailability_user_event_unique" ON "user_unavailability" ("user_id", "event_id");
--> statement-breakpoint
CREATE INDEX "user_unavailability_user_idx" ON "user_unavailability" ("user_id");
--> statement-breakpoint
CREATE INDEX "user_unavailability_event_idx" ON "user_unavailability" ("event_id");
--> statement-breakpoint

-- Drop ref_unavailability table (merged into user_unavailability)
DROP TABLE IF EXISTS "ref_unavailability";
