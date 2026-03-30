CREATE TYPE "public"."event_type" AS ENUM('tryout', 'regular_season', 'playoff', 'draft', 'captain_select', 'late_date');--> statement-breakpoint
CREATE TABLE "event_time_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"start_time" time NOT NULL,
	"slot_label" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_unavailability" (
	"id" serial PRIMARY KEY NOT NULL,
	"signup_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"event_type" "event_type" NOT NULL,
	"event_date" date NOT NULL,
	"sort_order" integer NOT NULL,
	"label" text
);
--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "date" SET DATA TYPE date USING 
  CASE 
    WHEN "date" ~ '^\d{4}-\d{2}-\d{2}$' THEN "date"::date
    WHEN "date" ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date("date", 'MM/DD/YYYY')
    WHEN "date" ~ '^\d{1,2}/\d{1,2}$' THEN NULL
    ELSE NULL
  END;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "time" SET DATA TYPE time USING 
  CASE 
    WHEN "time" ~ '^\d{2}:\d{2}:\d{2}$' THEN "time"::time
    WHEN "time" ~ '^\d{1,2}:\d{2}$' THEN ("time" || ':00')::time
    ELSE NULL
  END;--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "season_amount" SET DATA TYPE numeric USING "season_amount"::numeric;--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "late_amount" SET DATA TYPE numeric USING "late_amount"::numeric;--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "max_players" SET DATA TYPE integer USING "max_players"::integer;--> statement-breakpoint
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_event_id_season_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."season_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_unavailability" ADD CONSTRAINT "player_unavailability_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_unavailability" ADD CONSTRAINT "player_unavailability_event_id_season_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."season_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_events" ADD CONSTRAINT "season_events_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_time_slots_event_idx" ON "event_time_slots" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "player_unavailability_signup_idx" ON "player_unavailability" USING btree ("signup_id");--> statement-breakpoint
CREATE INDEX "player_unavailability_event_idx" ON "player_unavailability" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_unavailability_signup_event_unique" ON "player_unavailability" USING btree ("signup_id","event_id");--> statement-breakpoint
CREATE INDEX "season_events_season_idx" ON "season_events" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "season_events_type_idx" ON "season_events" USING btree ("season_id","event_type");--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "late_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_1_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_1_s1_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_1_s2_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_2_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_2_s1_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_2_s2_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_2_s3_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_3_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_3_s1_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_3_s2_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "tryout_3_s3_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_s1_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_s2_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_s3_time";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_1_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_2_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_3_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_4_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_5_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "season_6_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "captain_select_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "draft_1_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "draft_2_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "draft_3_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "draft_4_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "draft_5_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "draft_6_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "playoff_1_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "playoff_2_date";--> statement-breakpoint
ALTER TABLE "seasons" DROP COLUMN "playoff_3_date";--> statement-breakpoint
ALTER TABLE "signups" DROP COLUMN "dates_missing";--> statement-breakpoint
ALTER TABLE "signups" DROP COLUMN "play_1st_week";