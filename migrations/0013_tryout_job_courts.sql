CREATE TYPE "public"."tryout_job_court_scope" AS ENUM('general', 'per_court');--> statement-breakpoint
ALTER TABLE "tryout_volunteer_assignments" DROP CONSTRAINT "tryout_volunteer_assignments_uniq";--> statement-breakpoint
ALTER TABLE "season_events" ADD COLUMN "court_numbers" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tryout_volunteer_assignments" ADD COLUMN "court_number" integer;--> statement-breakpoint
ALTER TABLE "tryout_volunteer_jobs" ADD COLUMN "court_scope" "tryout_job_court_scope" DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "tryout_volunteer_assignments" ADD CONSTRAINT "tryout_volunteer_assignments_uniq" UNIQUE NULLS NOT DISTINCT("job_id","time_slot_id","court_number","user_id");