ALTER TABLE "matchs" RENAME TO "matches";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "preffered_name" TO "preferred_name";--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matchs_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matchs_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matchs_home_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matchs_away_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matchs_winner_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" DROP CONSTRAINT "playoff_matches_meta_match_id_matchs_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_teams_id_fk" FOREIGN KEY ("home_team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_teams_id_fk" FOREIGN KEY ("away_team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_teams_id_fk" FOREIGN KEY ("winner") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_team_idx" ON "drafts" USING btree ("team");--> statement-breakpoint
CREATE INDEX "drafts_user_idx" ON "drafts" USING btree ("user");--> statement-breakpoint
CREATE INDEX "matches_season_idx" ON "matches" USING btree ("season");--> statement-breakpoint
CREATE INDEX "matches_division_idx" ON "matches" USING btree ("division");--> statement-breakpoint
CREATE INDEX "matches_season_division_idx" ON "matches" USING btree ("season","division");--> statement-breakpoint
CREATE INDEX "signups_season_idx" ON "signups" USING btree ("season");--> statement-breakpoint
CREATE INDEX "signups_player_idx" ON "signups" USING btree ("player");--> statement-breakpoint
CREATE INDEX "teams_season_idx" ON "teams" USING btree ("season");--> statement-breakpoint
CREATE INDEX "teams_captain_idx" ON "teams" USING btree ("captain");--> statement-breakpoint
CREATE INDEX "week1_rosters_season_idx" ON "week1_rosters" USING btree ("season");--> statement-breakpoint
CREATE INDEX "week2_rosters_season_idx" ON "week2_rosters" USING btree ("season");--> statement-breakpoint
CREATE INDEX "week3_rosters_season_idx" ON "week3_rosters" USING btree ("season");