CREATE TYPE "public"."event_type" AS ENUM('tryout', 'regular_season', 'playoff', 'draft', 'captain_select', 'late_date');--> statement-breakpoint
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
CREATE TABLE "concern_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"concern_id" integer NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concern_received" (
	"id" serial PRIMARY KEY NOT NULL,
	"concern_id" integer NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"subject" text NOT NULL,
	"body_text" text,
	"body_html" text,
	"postmark_message_id" text,
	"received_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concern_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"concern_id" integer NOT NULL,
	"sent_by" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"sent_to" text NOT NULL,
	"postmark_message_id" text,
	"sent_at" timestamp NOT NULL
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
	"source" text DEFAULT 'web' NOT NULL,
	"source_email_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deleted_signups" (
	"id" integer PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"player" text NOT NULL,
	"age" text,
	"captain" text,
	"pair" boolean,
	"pair_pick" text,
	"pair_reason" text,
	"order_id" text,
	"amount_paid" numeric,
	"created_at" timestamp NOT NULL,
	"deleted_at" timestamp NOT NULL,
	"deleted_by" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user" text NOT NULL,
	"percentage" numeric NOT NULL,
	"expiration" timestamp,
	"reason" text,
	"used" boolean NOT NULL,
	"scope" text DEFAULT 'season' NOT NULL,
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
CREATE TABLE "email_broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_group_id" integer,
	"stream_id" text,
	"template_id" integer,
	"subject" text NOT NULL,
	"html_content" text NOT NULL,
	"lexical_content" jsonb NOT NULL,
	"sent_by" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"recipient_total" integer,
	"sent_count" integer,
	"failed_count" integer,
	"sent_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_recipient_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group_type" text NOT NULL,
	"season_id" integer,
	"division_id" integer,
	"team_id" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"stream_id" text NOT NULL,
	"reason" text NOT NULL,
	"origin" text NOT NULL,
	"suppressed_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
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
CREATE TABLE "event_time_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"start_time" time NOT NULL,
	"slot_label" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_email_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_email_received" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"subject" text NOT NULL,
	"body_text" text,
	"body_html" text,
	"postmark_message_id" text,
	"received_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_email_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"sent_by" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"sent_to" text NOT NULL,
	"postmark_message_id" text,
	"sent_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text,
	"body_html" text,
	"status" text NOT NULL,
	"assigned_to" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
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
CREATE TABLE "match_referees" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"referee_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"division" integer NOT NULL,
	"week" integer NOT NULL,
	"date" date,
	"time" time,
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
	"work_source" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"match_date" date NOT NULL,
	"image_path" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp NOT NULL
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
CREATE TABLE "season_refs" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"is_certified" boolean NOT NULL,
	"has_w9" boolean DEFAULT false NOT NULL,
	"passed_test" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_division_level" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"year" integer NOT NULL,
	"season" text NOT NULL,
	"phase" text NOT NULL,
	"season_amount" numeric,
	"late_amount" numeric,
	"max_players" integer,
	"certified_ref_rate" numeric,
	"uncertified_ref_rate" numeric
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
	"order_id" text,
	"amount_paid" numeric,
	"created_at" timestamp NOT NULL
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
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"captain" text NOT NULL,
	"captain2" text,
	"division" integer NOT NULL,
	"name" text NOT NULL,
	"number" integer,
	"rank" integer,
	"picture_url" text
);
--> statement-breakpoint
CREATE TABLE "tournament_divisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"division_id" integer NOT NULL,
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
CREATE TABLE "tournament_placements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"place" integer NOT NULL,
	"created_at" timestamp NOT NULL
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
	"preferred_division_id" integer,
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
	"pool_sets_mode" text DEFAULT 'exact' NOT NULL,
	"pool_sets_count" integer DEFAULT 2 NOT NULL,
	"playoff_sets_mode" text DEFAULT 'best_of' NOT NULL,
	"playoff_sets_count" integer DEFAULT 3 NOT NULL,
	"additional_info" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "tournaments_code_unique" UNIQUE("code")
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
CREATE TABLE "user_unavailability" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"signup_id" integer,
	"event_id" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preferred_name" text,
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
	"male" boolean,
	"onboarding_completed" boolean,
	"seasons_list" text NOT NULL,
	"notification_list" text NOT NULL,
	"captain_eligible" boolean NOT NULL,
	"email_status" text DEFAULT 'valid' NOT NULL,
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
CREATE TABLE "waiver_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"waiver_id" integer NOT NULL,
	"accepted_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text
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
ALTER TABLE "concern_comments" ADD CONSTRAINT "concern_comments_concern_id_concerns_id_fk" FOREIGN KEY ("concern_id") REFERENCES "public"."concerns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_comments" ADD CONSTRAINT "concern_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_received" ADD CONSTRAINT "concern_received_concern_id_concerns_id_fk" FOREIGN KEY ("concern_id") REFERENCES "public"."concerns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_replies" ADD CONSTRAINT "concern_replies_concern_id_concerns_id_fk" FOREIGN KEY ("concern_id") REFERENCES "public"."concerns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_replies" ADD CONSTRAINT "concern_replies_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concerns" ADD CONSTRAINT "concerns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concerns" ADD CONSTRAINT "concerns_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_recipient_group_id_email_recipient_groups_id_fk" FOREIGN KEY ("recipient_group_id") REFERENCES "public"."email_recipient_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ADD CONSTRAINT "email_recipient_groups_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ADD CONSTRAINT "email_recipient_groups_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ADD CONSTRAINT "email_recipient_groups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_users_id_fk" FOREIGN KEY ("evaluator") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_event_id_season_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."season_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_comments" ADD CONSTRAINT "inbound_email_comments_email_id_inbound_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_comments" ADD CONSTRAINT "inbound_email_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_received" ADD CONSTRAINT "inbound_email_received_email_id_inbound_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_replies" ADD CONSTRAINT "inbound_email_replies_email_id_inbound_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_replies" ADD CONSTRAINT "inbound_email_replies_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD CONSTRAINT "individual_divisions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD CONSTRAINT "individual_divisions_divisions_divisions_id_fk" FOREIGN KEY ("divisions") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_referees" ADD CONSTRAINT "match_referees_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_match_matches_id_fk" FOREIGN KEY ("match") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_original_user_users_id_fk" FOREIGN KEY ("original_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_sub_user_users_id_fk" FOREIGN KEY ("sub_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_teams_id_fk" FOREIGN KEY ("home_team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_teams_id_fk" FOREIGN KEY ("away_team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_teams_id_fk" FOREIGN KEY ("winner") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_evaluator_users_id_fk" FOREIGN KEY ("evaluator") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_work_team_teams_id_fk" FOREIGN KEY ("work_team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_events" ADD CONSTRAINT "season_events_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_refs" ADD CONSTRAINT "season_refs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_refs" ADD CONSTRAINT "season_refs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_pair_pick_users_id_fk" FOREIGN KEY ("pair_pick") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_original_draft_drafts_id_fk" FOREIGN KEY ("original_draft") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_original_user_users_id_fk" FOREIGN KEY ("original_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_sub_user_users_id_fk" FOREIGN KEY ("sub_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_users_id_fk" FOREIGN KEY ("captain") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain2_users_id_fk" FOREIGN KEY ("captain2") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_divisions" ADD CONSTRAINT "tournament_divisions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_divisions" ADD CONSTRAINT "tournament_divisions_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_division_id_tournament_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_pool_id_tournament_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."tournament_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_home_team_id_tournament_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_away_team_id_tournament_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_team_id_tournament_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_work_team_id_tournament_teams_id_fk" FOREIGN KEY ("work_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_placements" ADD CONSTRAINT "tournament_placements_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_placements" ADD CONSTRAINT "tournament_placements_division_id_tournament_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_placements" ADD CONSTRAINT "tournament_placements_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "tournament_waitlist" ADD CONSTRAINT "tournament_waitlist_preferred_division_id_tournament_divisions_id_fk" FOREIGN KEY ("preferred_division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unavailability" ADD CONSTRAINT "user_unavailability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unavailability" ADD CONSTRAINT "user_unavailability_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unavailability" ADD CONSTRAINT "user_unavailability_event_id_season_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."season_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_acceptances" ADD CONSTRAINT "waiver_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_acceptances" ADD CONSTRAINT "waiver_acceptances_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week1_rosters" ADD CONSTRAINT "week1_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week1_rosters" ADD CONSTRAINT "week1_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deleted_signups_season_idx" ON "deleted_signups" USING btree ("season");--> statement-breakpoint
CREATE INDEX "deleted_signups_player_idx" ON "deleted_signups" USING btree ("player");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_capt_rounds_season_div_captain_uniq" ON "draft_capt_rounds" USING btree ("season","division","captain");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_pair_diffs_season_div_players_uniq" ON "draft_pair_diffs" USING btree ("season","division","player1","player2");--> statement-breakpoint
CREATE INDEX "drafts_team_idx" ON "drafts" USING btree ("team");--> statement-breakpoint
CREATE INDEX "drafts_user_idx" ON "drafts" USING btree ("user");--> statement-breakpoint
CREATE UNIQUE INDEX "email_recipient_groups_type_season_div_team_uniq" ON "email_recipient_groups" USING btree ("group_type","season_id","division_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_email_stream_uniq" ON "email_suppressions" USING btree ("email","stream_id");--> statement-breakpoint
CREATE INDEX "event_time_slots_event_idx" ON "event_time_slots" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_referees_match_role_idx" ON "match_referees" USING btree ("match_id","role");--> statement-breakpoint
CREATE INDEX "match_referees_referee_idx" ON "match_referees" USING btree ("referee_id");--> statement-breakpoint
CREATE INDEX "match_referees_season_idx" ON "match_referees" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "match_substitutions_match_idx" ON "match_substitutions" USING btree ("match");--> statement-breakpoint
CREATE INDEX "match_substitutions_team_idx" ON "match_substitutions" USING btree ("team");--> statement-breakpoint
CREATE INDEX "match_substitutions_season_idx" ON "match_substitutions" USING btree ("season");--> statement-breakpoint
CREATE INDEX "match_substitutions_sub_user_idx" ON "match_substitutions" USING btree ("sub_user");--> statement-breakpoint
CREATE UNIQUE INDEX "match_substitutions_match_original_uniq" ON "match_substitutions" USING btree ("match","original_user");--> statement-breakpoint
CREATE INDEX "matches_season_idx" ON "matches" USING btree ("season");--> statement-breakpoint
CREATE INDEX "matches_division_idx" ON "matches" USING btree ("division");--> statement-breakpoint
CREATE INDEX "matches_season_division_idx" ON "matches" USING btree ("season","division");--> statement-breakpoint
CREATE UNIQUE INDEX "player_ratings_season_player_evaluator_unique" ON "player_ratings" USING btree ("season","player","evaluator");--> statement-breakpoint
CREATE INDEX "score_sheets_season_div_date_idx" ON "score_sheets" USING btree ("season_id","division_id","match_date");--> statement-breakpoint
CREATE INDEX "season_events_season_idx" ON "season_events" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "season_events_type_idx" ON "season_events" USING btree ("season_id","event_type");--> statement-breakpoint
CREATE INDEX "season_refs_season_idx" ON "season_refs" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "season_refs_user_idx" ON "season_refs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_refs_unique" ON "season_refs" USING btree ("season_id","user_id");--> statement-breakpoint
CREATE INDEX "signups_season_idx" ON "signups" USING btree ("season");--> statement-breakpoint
CREATE INDEX "signups_player_idx" ON "signups" USING btree ("player");--> statement-breakpoint
CREATE INDEX "substitutions_team_idx" ON "substitutions" USING btree ("team");--> statement-breakpoint
CREATE INDEX "substitutions_season_idx" ON "substitutions" USING btree ("season");--> statement-breakpoint
CREATE INDEX "substitutions_original_draft_idx" ON "substitutions" USING btree ("original_draft");--> statement-breakpoint
CREATE INDEX "substitutions_sub_user_idx" ON "substitutions" USING btree ("sub_user");--> statement-breakpoint
CREATE INDEX "teams_season_idx" ON "teams" USING btree ("season");--> statement-breakpoint
CREATE INDEX "teams_captain_idx" ON "teams" USING btree ("captain");--> statement-breakpoint
CREATE INDEX "tournament_divisions_tournament_idx" ON "tournament_divisions" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_divisions_tournament_division_uniq" ON "tournament_divisions" USING btree ("tournament_id","division_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_tournament_idx" ON "tournament_matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_pool_idx" ON "tournament_matches" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_division_idx" ON "tournament_matches" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_court_time_idx" ON "tournament_matches" USING btree ("tournament_id","court","start_time");--> statement-breakpoint
CREATE INDEX "tournament_placements_tournament_idx" ON "tournament_placements" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_placements_tournament_team_uniq" ON "tournament_placements" USING btree ("tournament_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_placements_division_place_uniq" ON "tournament_placements" USING btree ("tournament_id","division_id","place");--> statement-breakpoint
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
CREATE UNIQUE INDEX "tournament_waitlist_tournament_user_uniq" ON "tournament_waitlist" USING btree ("tournament_id","user_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_season_idx" ON "user_roles" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "user_unavailability_user_idx" ON "user_unavailability" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_unavailability_event_idx" ON "user_unavailability" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_unavailability_user_event_unique" ON "user_unavailability" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_acceptances_user_waiver_idx" ON "waiver_acceptances" USING btree ("user_id","waiver_id");--> statement-breakpoint
CREATE INDEX "week1_rosters_season_idx" ON "week1_rosters" USING btree ("season");--> statement-breakpoint
CREATE INDEX "week2_rosters_season_idx" ON "week2_rosters" USING btree ("season");--> statement-breakpoint
CREATE INDEX "week3_rosters_season_idx" ON "week3_rosters" USING btree ("season");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_waiver_content_edit() RETURNS trigger AS $$
BEGIN
    IF NEW.content IS DISTINCT FROM OLD.content
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'waivers.content/created_at/id are immutable; create a new version instead';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER waivers_immutable
BEFORE UPDATE ON "waivers"
FOR EACH ROW EXECUTE FUNCTION prevent_waiver_content_edit();
