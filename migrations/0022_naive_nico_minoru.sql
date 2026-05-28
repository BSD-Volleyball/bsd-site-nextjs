CREATE TABLE "tournament_divisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"team_count" integer NOT NULL,
	"male_per_team" integer NOT NULL,
	"non_male_per_team" integer NOT NULL,
	"teams_advancing_per_pool" integer NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"pool_id" integer,
	"bracket" text NOT NULL,
	"bracket_round" integer,
	"bracket_slot" integer,
	"court" integer,
	"start_time" time,
	"home_team_id" integer,
	"away_team_id" integer,
	"home_set1_score" integer,
	"away_set1_score" integer,
	"home_set2_score" integer,
	"away_set2_score" integer,
	"home_set3_score" integer,
	"away_set3_score" integer,
	"winner_team_id" integer,
	"work_team_id" integer
);
--> statement-breakpoint
CREATE TABLE "tournament_pool_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"pool_id" integer NOT NULL,
	"team_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_roster" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"added_by_user_id" text NOT NULL,
	"added_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"division_id" integer,
	"preferred_division_id" integer NOT NULL,
	"captain_user_id" text NOT NULL,
	"name" text NOT NULL,
	"order_id" text,
	"amount_paid" numeric,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"waiver_id" integer NOT NULL,
	"approved" boolean NOT NULL,
	"placed_team_id" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"phase" text NOT NULL,
	"tournament_date" date NOT NULL,
	"checkin_time" time,
	"first_serve_time" time,
	"address" text,
	"cost" numeric,
	"late_cost" numeric,
	"late_date" date,
	"registration_close_date" date,
	"roster_lock_date" date,
	"tournament_type" text NOT NULL,
	"pool_size" integer NOT NULL,
	"elimination_format" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "tournaments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "tournament_divisions" ADD CONSTRAINT "tournament_divisions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_division_id_tournament_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_pool_id_tournament_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."tournament_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_home_team_id_tournament_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_away_team_id_tournament_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_team_id_tournament_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_work_team_id_tournament_teams_id_fk" FOREIGN KEY ("work_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_pool_teams" ADD CONSTRAINT "tournament_pool_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_pool_teams" ADD CONSTRAINT "tournament_pool_teams_pool_id_tournament_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."tournament_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_pool_teams" ADD CONSTRAINT "tournament_pool_teams_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_pools" ADD CONSTRAINT "tournament_pools_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_pools" ADD CONSTRAINT "tournament_pools_division_id_tournament_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_roster" ADD CONSTRAINT "tournament_roster_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_roster" ADD CONSTRAINT "tournament_roster_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_roster" ADD CONSTRAINT "tournament_roster_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_roster" ADD CONSTRAINT "tournament_roster_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_division_id_tournament_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_preferred_division_id_tournament_divisions_id_fk" FOREIGN KEY ("preferred_division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ADD CONSTRAINT "tournament_waitlist_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ADD CONSTRAINT "tournament_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ADD CONSTRAINT "tournament_waitlist_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ADD CONSTRAINT "tournament_waitlist_placed_team_id_tournament_teams_id_fk" FOREIGN KEY ("placed_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_divisions_tournament_idx" ON "tournament_divisions" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_tournament_idx" ON "tournament_matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_pool_idx" ON "tournament_matches" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_division_idx" ON "tournament_matches" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_court_time_idx" ON "tournament_matches" USING btree ("tournament_id","court","start_time");--> statement-breakpoint
CREATE INDEX "tournament_pool_teams_pool_idx" ON "tournament_pool_teams" USING btree ("pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_pool_teams_tournament_team_uniq" ON "tournament_pool_teams" USING btree ("tournament_id","team_id");--> statement-breakpoint
CREATE INDEX "tournament_pools_division_idx" ON "tournament_pools" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "tournament_roster_team_idx" ON "tournament_roster" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tournament_roster_user_idx" ON "tournament_roster" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_roster_tournament_user_uniq" ON "tournament_roster" USING btree ("tournament_id","user_id");--> statement-breakpoint
CREATE INDEX "tournament_teams_tournament_idx" ON "tournament_teams" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_teams_captain_idx" ON "tournament_teams" USING btree ("captain_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_teams_tournament_captain_uniq" ON "tournament_teams" USING btree ("tournament_id","captain_user_id");--> statement-breakpoint
CREATE INDEX "tournament_waitlist_tournament_idx" ON "tournament_waitlist" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_waitlist_tournament_user_uniq" ON "tournament_waitlist" USING btree ("tournament_id","user_id");