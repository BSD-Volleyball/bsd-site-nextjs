CREATE TABLE "tournament_placements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"place" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_placements" ADD CONSTRAINT "tournament_placements_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_placements" ADD CONSTRAINT "tournament_placements_division_id_tournament_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_placements" ADD CONSTRAINT "tournament_placements_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_placements_tournament_idx" ON "tournament_placements" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_placements_tournament_team_uniq" ON "tournament_placements" USING btree ("tournament_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_placements_division_place_uniq" ON "tournament_placements" USING btree ("tournament_id","division_id","place");
