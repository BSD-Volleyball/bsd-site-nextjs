ALTER TABLE "season_refs" ADD COLUMN "passed_test" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "season_refs" ADD COLUMN "is_active" boolean NOT NULL DEFAULT true;