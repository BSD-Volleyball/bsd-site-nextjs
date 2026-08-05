CREATE TYPE "public"."tryout_job_scope" AS ENUM('whole_night', 'per_session');--> statement-breakpoint
CREATE TABLE "tryout_volunteer_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"time_slot_id" integer,
	"user_id" text NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tryout_volunteer_assignments_uniq" UNIQUE NULLS NOT DISTINCT("job_id","time_slot_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tryout_volunteer_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"name" text NOT NULL,
	"needed" integer DEFAULT 1 NOT NULL,
	"scope" "tryout_job_scope" NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tryout_volunteer_assignments" ADD CONSTRAINT "tryout_volunteer_assignments_job_id_tryout_volunteer_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."tryout_volunteer_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_volunteer_assignments" ADD CONSTRAINT "tryout_volunteer_assignments_time_slot_id_event_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."event_time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_volunteer_assignments" ADD CONSTRAINT "tryout_volunteer_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_volunteer_assignments" ADD CONSTRAINT "tryout_volunteer_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_volunteer_jobs" ADD CONSTRAINT "tryout_volunteer_jobs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_volunteer_jobs" ADD CONSTRAINT "tryout_volunteer_jobs_event_id_season_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."season_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tryout_volunteer_assignments_job_idx" ON "tryout_volunteer_assignments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "tryout_volunteer_assignments_user_idx" ON "tryout_volunteer_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tryout_volunteer_jobs_season_event_idx" ON "tryout_volunteer_jobs" USING btree ("season_id","event_id");