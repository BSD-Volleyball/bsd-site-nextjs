CREATE TABLE "match_substitutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"match" integer NOT NULL,
	"team" integer NOT NULL,
	"season" integer NOT NULL,
	"original_user" text NOT NULL,
	"sub_user" text NOT NULL,
	"performed_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "substitutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"team" integer NOT NULL,
	"season" integer NOT NULL,
	"original_draft" integer NOT NULL,
	"original_user" text NOT NULL,
	"sub_user" text NOT NULL,
	"effective_at" timestamp NOT NULL,
	"performed_by" text NOT NULL,
	"reason" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_match_matches_id_fk" FOREIGN KEY ("match") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_original_user_users_id_fk" FOREIGN KEY ("original_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_sub_user_users_id_fk" FOREIGN KEY ("sub_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_original_draft_drafts_id_fk" FOREIGN KEY ("original_draft") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_original_user_users_id_fk" FOREIGN KEY ("original_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_sub_user_users_id_fk" FOREIGN KEY ("sub_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_substitutions_match_idx" ON "match_substitutions" USING btree ("match");--> statement-breakpoint
CREATE INDEX "match_substitutions_team_idx" ON "match_substitutions" USING btree ("team");--> statement-breakpoint
CREATE INDEX "match_substitutions_season_idx" ON "match_substitutions" USING btree ("season");--> statement-breakpoint
CREATE INDEX "match_substitutions_sub_user_idx" ON "match_substitutions" USING btree ("sub_user");--> statement-breakpoint
CREATE UNIQUE INDEX "match_substitutions_match_original_uniq" ON "match_substitutions" USING btree ("match","original_user");--> statement-breakpoint
CREATE INDEX "substitutions_team_idx" ON "substitutions" USING btree ("team");--> statement-breakpoint
CREATE INDEX "substitutions_season_idx" ON "substitutions" USING btree ("season");--> statement-breakpoint
CREATE INDEX "substitutions_original_draft_idx" ON "substitutions" USING btree ("original_draft");--> statement-breakpoint
CREATE INDEX "substitutions_sub_user_idx" ON "substitutions" USING btree ("sub_user");