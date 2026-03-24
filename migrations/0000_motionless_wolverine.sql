CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"summary" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "champions" (
	"id" serial PRIMARY KEY NOT NULL,
	"team" integer NOT NULL,
	"season" integer NOT NULL,
	"division" integer NOT NULL,
	"picture" text,
	"picture2" text,
	"caption" text
);
--> statement-breakpoint
CREATE TABLE "commissioners" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"commissioner" text NOT NULL,
	"division" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concern_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"concern_id" integer NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concerns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"anonymous" boolean NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"want_followup" boolean NOT NULL,
	"incident_date" text NOT NULL,
	"location" text NOT NULL,
	"person_involved" text NOT NULL,
	"witnesses" text,
	"team_match" text,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"assigned_to" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user" text NOT NULL,
	"percentage" numeric NOT NULL,
	"expiration" timestamp,
	"reason" text,
	"used" boolean NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"active" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_capt_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"division" integer NOT NULL,
	"saved_by" text NOT NULL,
	"captain" text NOT NULL,
	"round" integer NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_homework" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"captain" text NOT NULL,
	"division" integer NOT NULL,
	"round" integer NOT NULL,
	"slot" integer NOT NULL,
	"player" text NOT NULL,
	"is_male_tab" boolean NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_pair_diffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"division" integer NOT NULL,
	"saved_by" text NOT NULL,
	"player1" text NOT NULL,
	"player2" text NOT NULL,
	"diff" integer NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team" integer NOT NULL,
	"user" text NOT NULL,
	"round" integer NOT NULL,
	"overall" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"content" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "email_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"player" text NOT NULL,
	"division" integer NOT NULL,
	"evaluator" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "individual_divisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"divisions" integer NOT NULL,
	"coaches" boolean NOT NULL,
	"gender_split" text NOT NULL,
	"teams" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchs" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"division" integer NOT NULL,
	"week" integer NOT NULL,
	"date" text,
	"time" text,
	"court" integer,
	"home_team" integer,
	"away_team" integer,
	"home_score" integer,
	"away_score" integer,
	"home_set1_score" integer,
	"away_set1_score" integer,
	"home_set2_score" integer,
	"away_set2_score" integer,
	"home_set3_score" integer,
	"away_set3_score" integer,
	"winner" integer,
	"playoff" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moving_day" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"submitted_by" text NOT NULL,
	"player" text NOT NULL,
	"direction" text NOT NULL,
	"is_forced" boolean NOT NULL,
	"submitted_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"player" text NOT NULL,
	"evaluator" text NOT NULL,
	"overall" real,
	"passing" real,
	"setting" real,
	"hitting" real,
	"serving" real,
	"shared_notes" text,
	"private_notes" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playoff_matches_meta" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"division" integer NOT NULL,
	"week" integer NOT NULL,
	"match_num" integer NOT NULL,
	"match_id" integer,
	"bracket" text,
	"home_source" text NOT NULL,
	"away_source" text NOT NULL,
	"next_match_num" integer,
	"next_loser_match_num" integer,
	"work_team" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"year" integer NOT NULL,
	"season" text NOT NULL,
	"phase" text NOT NULL,
	"late_date" text,
	"tryout_1_date" text,
	"tryout_1_s1_time" text,
	"tryout_1_s2_time" text,
	"tryout_2_date" text,
	"tryout_2_s1_time" text,
	"tryout_2_s2_time" text,
	"tryout_2_s3_time" text,
	"tryout_3_date" text,
	"tryout_3_s1_time" text,
	"tryout_3_s2_time" text,
	"tryout_3_s3_time" text,
	"season_s1_time" text,
	"season_s2_time" text,
	"season_s3_time" text,
	"season_1_date" text,
	"season_2_date" text,
	"season_3_date" text,
	"season_4_date" text,
	"season_5_date" text,
	"season_6_date" text,
	"captain_select_date" text,
	"draft_1_date" text,
	"draft_2_date" text,
	"draft_3_date" text,
	"draft_4_date" text,
	"draft_5_date" text,
	"draft_6_date" text,
	"playoff_1_date" text,
	"playoff_2_date" text,
	"playoff_3_date" text,
	"season_amount" text,
	"late_amount" text,
	"max_players" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"player" text NOT NULL,
	"age" text,
	"captain" text,
	"pair" boolean,
	"pair_pick" text,
	"pair_reason" text,
	"dates_missing" text,
	"play_1st_week" boolean,
	"order_id" text,
	"amount_paid" numeric,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"captain" text NOT NULL,
	"captain2" text,
	"division" integer NOT NULL,
	"name" text NOT NULL,
	"number" integer,
	"rank" integer
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"season_id" integer,
	"division_id" integer,
	"granted_by" text,
	"granted_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preffered_name" text,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"avatar" text,
	"avatar_url" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"old_id" serial NOT NULL,
	"picture" text,
	"phone" text,
	"experience" text,
	"assessment" text,
	"height" integer,
	"skill_setter" boolean,
	"skill_hitter" boolean,
	"skill_passer" boolean,
	"skill_other" boolean,
	"emergency_contact" text,
	"referred_by" text,
	"pronouns" text,
	"role" text,
	"male" boolean,
	"onboarding_completed" boolean,
	"seasons_list" text NOT NULL,
	"notification_list" text NOT NULL,
	"captain_eligible" boolean NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"user" text NOT NULL,
	"approved" boolean NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week1_rosters" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"user" text NOT NULL,
	"session_number" integer NOT NULL,
	"court_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week2_rosters" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"user" text NOT NULL,
	"division" integer NOT NULL,
	"team_number" integer NOT NULL,
	"is_captain" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week3_rosters" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"user" text NOT NULL,
	"division" integer NOT NULL,
	"team_number" integer NOT NULL,
	"is_captain" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champions" ADD CONSTRAINT "champions_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champions" ADD CONSTRAINT "champions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champions" ADD CONSTRAINT "champions_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissioners" ADD CONSTRAINT "commissioners_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissioners" ADD CONSTRAINT "commissioners_commissioner_users_id_fk" FOREIGN KEY ("commissioner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissioners" ADD CONSTRAINT "commissioners_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_comments" ADD CONSTRAINT "concern_comments_concern_id_concerns_id_fk" FOREIGN KEY ("concern_id") REFERENCES "public"."concerns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_comments" ADD CONSTRAINT "concern_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concerns" ADD CONSTRAINT "concerns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concerns" ADD CONSTRAINT "concerns_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ADD CONSTRAINT "draft_capt_rounds_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ADD CONSTRAINT "draft_capt_rounds_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ADD CONSTRAINT "draft_capt_rounds_saved_by_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ADD CONSTRAINT "draft_capt_rounds_captain_users_id_fk" FOREIGN KEY ("captain") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_homework" ADD CONSTRAINT "draft_homework_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_homework" ADD CONSTRAINT "draft_homework_captain_users_id_fk" FOREIGN KEY ("captain") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_homework" ADD CONSTRAINT "draft_homework_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_homework" ADD CONSTRAINT "draft_homework_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_saved_by_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_player1_users_id_fk" FOREIGN KEY ("player1") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_player2_users_id_fk" FOREIGN KEY ("player2") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_users_id_fk" FOREIGN KEY ("evaluator") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD CONSTRAINT "individual_divisions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD CONSTRAINT "individual_divisions_divisions_divisions_id_fk" FOREIGN KEY ("divisions") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchs" ADD CONSTRAINT "matchs_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchs" ADD CONSTRAINT "matchs_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchs" ADD CONSTRAINT "matchs_home_team_teams_id_fk" FOREIGN KEY ("home_team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchs" ADD CONSTRAINT "matchs_away_team_teams_id_fk" FOREIGN KEY ("away_team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchs" ADD CONSTRAINT "matchs_winner_teams_id_fk" FOREIGN KEY ("winner") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_evaluator_users_id_fk" FOREIGN KEY ("evaluator") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_match_id_matchs_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matchs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_work_team_teams_id_fk" FOREIGN KEY ("work_team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_pair_pick_users_id_fk" FOREIGN KEY ("pair_pick") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_users_id_fk" FOREIGN KEY ("captain") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain2_users_id_fk" FOREIGN KEY ("captain2") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week1_rosters" ADD CONSTRAINT "week1_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week1_rosters" ADD CONSTRAINT "week1_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_capt_rounds_season_div_captain_uniq" ON "draft_capt_rounds" USING btree ("season","division","captain");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_pair_diffs_season_div_players_uniq" ON "draft_pair_diffs" USING btree ("season","division","player1","player2");--> statement-breakpoint
CREATE UNIQUE INDEX "player_ratings_season_player_evaluator_unique" ON "player_ratings" USING btree ("season","player","evaluator");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_season_idx" ON "user_roles" USING btree ("season_id");