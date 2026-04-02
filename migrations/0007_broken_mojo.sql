CREATE TABLE "match_referees" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"referee_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ref_unavailability" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_ref_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_refs" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"is_certified" boolean NOT NULL,
	"max_division_level" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "certified_ref_rate" numeric;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "uncertified_ref_rate" numeric;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ref_unavailability" ADD CONSTRAINT "ref_unavailability_season_ref_id_season_refs_id_fk" FOREIGN KEY ("season_ref_id") REFERENCES "public"."season_refs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ref_unavailability" ADD CONSTRAINT "ref_unavailability_event_id_season_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."season_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_refs" ADD CONSTRAINT "season_refs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_refs" ADD CONSTRAINT "season_refs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_referees_match_idx" ON "match_referees" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_referees_referee_idx" ON "match_referees" USING btree ("referee_id");--> statement-breakpoint
CREATE INDEX "match_referees_season_idx" ON "match_referees" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ref_unavailability_unique" ON "ref_unavailability" USING btree ("season_ref_id","event_id");--> statement-breakpoint
CREATE INDEX "season_refs_season_idx" ON "season_refs" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "season_refs_user_idx" ON "season_refs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_refs_unique" ON "season_refs" USING btree ("season_id","user_id");