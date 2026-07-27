ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "champions" DROP CONSTRAINT "champions_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "champions" DROP CONSTRAINT "champions_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "champions" DROP CONSTRAINT "champions_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "concern_comments" DROP CONSTRAINT "concern_comments_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "concern_replies" DROP CONSTRAINT "concern_replies_sent_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "concerns" DROP CONSTRAINT "concerns_assigned_to_users_id_fk";
--> statement-breakpoint
ALTER TABLE "deleted_signups" DROP CONSTRAINT "deleted_signups_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "deleted_signups" DROP CONSTRAINT "deleted_signups_player_users_id_fk";
--> statement-breakpoint
ALTER TABLE "deleted_signups" DROP CONSTRAINT "deleted_signups_deleted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT "discounts_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" DROP CONSTRAINT "draft_capt_rounds_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" DROP CONSTRAINT "draft_capt_rounds_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" DROP CONSTRAINT "draft_capt_rounds_saved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" DROP CONSTRAINT "draft_capt_rounds_captain_users_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_homework" DROP CONSTRAINT "draft_homework_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_homework" DROP CONSTRAINT "draft_homework_captain_users_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_homework" DROP CONSTRAINT "draft_homework_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_homework" DROP CONSTRAINT "draft_homework_player_users_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" DROP CONSTRAINT "draft_pair_diffs_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" DROP CONSTRAINT "draft_pair_diffs_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" DROP CONSTRAINT "draft_pair_diffs_saved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" DROP CONSTRAINT "draft_pair_diffs_player1_users_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" DROP CONSTRAINT "draft_pair_diffs_player2_users_id_fk";
--> statement-breakpoint
ALTER TABLE "drafts" DROP CONSTRAINT "drafts_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "drafts" DROP CONSTRAINT "drafts_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "email_broadcasts" DROP CONSTRAINT "email_broadcasts_recipient_group_id_email_recipient_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "email_broadcasts" DROP CONSTRAINT "email_broadcasts_sent_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_player_users_id_fk";
--> statement-breakpoint
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_evaluator_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inbound_email_comments" DROP CONSTRAINT "inbound_email_comments_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inbound_email_replies" DROP CONSTRAINT "inbound_email_replies_sent_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inbound_emails" DROP CONSTRAINT "inbound_emails_assigned_to_users_id_fk";
--> statement-breakpoint
ALTER TABLE "individual_divisions" DROP CONSTRAINT "individual_divisions_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "individual_divisions" DROP CONSTRAINT "individual_divisions_divisions_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "match_substitutions" DROP CONSTRAINT "match_substitutions_match_matches_id_fk";
--> statement-breakpoint
ALTER TABLE "match_substitutions" DROP CONSTRAINT "match_substitutions_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "match_substitutions" DROP CONSTRAINT "match_substitutions_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "match_substitutions" DROP CONSTRAINT "match_substitutions_original_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "match_substitutions" DROP CONSTRAINT "match_substitutions_sub_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "match_substitutions" DROP CONSTRAINT "match_substitutions_performed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matches_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matches_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matches_home_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matches_away_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matches_winner_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "moving_day" DROP CONSTRAINT "moving_day_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "moving_day" DROP CONSTRAINT "moving_day_submitted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "moving_day" DROP CONSTRAINT "moving_day_player_users_id_fk";
--> statement-breakpoint
ALTER TABLE "player_ratings" DROP CONSTRAINT "player_ratings_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "player_ratings" DROP CONSTRAINT "player_ratings_player_users_id_fk";
--> statement-breakpoint
ALTER TABLE "player_ratings" DROP CONSTRAINT "player_ratings_evaluator_users_id_fk";
--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" DROP CONSTRAINT "playoff_matches_meta_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" DROP CONSTRAINT "playoff_matches_meta_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" DROP CONSTRAINT "playoff_matches_meta_match_id_matches_id_fk";
--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" DROP CONSTRAINT "playoff_matches_meta_work_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "score_sheets" DROP CONSTRAINT "score_sheets_season_id_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "score_sheets" DROP CONSTRAINT "score_sheets_division_id_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "score_sheets" DROP CONSTRAINT "score_sheets_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "signups" DROP CONSTRAINT "signups_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "signups" DROP CONSTRAINT "signups_player_users_id_fk";
--> statement-breakpoint
ALTER TABLE "signups" DROP CONSTRAINT "signups_pair_pick_users_id_fk";
--> statement-breakpoint
ALTER TABLE "substitutions" DROP CONSTRAINT "substitutions_team_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "substitutions" DROP CONSTRAINT "substitutions_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "substitutions" DROP CONSTRAINT "substitutions_original_draft_drafts_id_fk";
--> statement-breakpoint
ALTER TABLE "substitutions" DROP CONSTRAINT "substitutions_original_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "substitutions" DROP CONSTRAINT "substitutions_sub_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "substitutions" DROP CONSTRAINT "substitutions_performed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_captain_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_captain2_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_divisions" DROP CONSTRAINT "tournament_divisions_division_id_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_matches" DROP CONSTRAINT "tournament_matches_winner_team_id_tournament_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_matches" DROP CONSTRAINT "tournament_matches_work_team_id_tournament_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_roster" DROP CONSTRAINT "tournament_roster_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_roster" DROP CONSTRAINT "tournament_roster_added_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_teams" DROP CONSTRAINT "tournament_teams_tournament_id_tournaments_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_teams" DROP CONSTRAINT "tournament_teams_division_id_tournament_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_teams" DROP CONSTRAINT "tournament_teams_captain_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_waitlist" DROP CONSTRAINT "tournament_waitlist_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tournament_waitlist" DROP CONSTRAINT "tournament_waitlist_waiver_id_waivers_id_fk";
--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_season_id_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_division_id_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_granted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "waitlist" DROP CONSTRAINT "waitlist_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "waitlist" DROP CONSTRAINT "waitlist_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "waiver_acceptances" DROP CONSTRAINT "waiver_acceptances_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "waiver_acceptances" DROP CONSTRAINT "waiver_acceptances_waiver_id_waivers_id_fk";
--> statement-breakpoint
ALTER TABLE "waivers" DROP CONSTRAINT "waivers_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "week1_rosters" DROP CONSTRAINT "week1_rosters_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "week1_rosters" DROP CONSTRAINT "week1_rosters_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "week2_rosters" DROP CONSTRAINT "week2_rosters_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "week2_rosters" DROP CONSTRAINT "week2_rosters_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "week2_rosters" DROP CONSTRAINT "week2_rosters_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "week3_rosters" DROP CONSTRAINT "week3_rosters_season_seasons_id_fk";
--> statement-breakpoint
ALTER TABLE "week3_rosters" DROP CONSTRAINT "week3_rosters_user_users_id_fk";
--> statement-breakpoint
ALTER TABLE "week3_rosters" DROP CONSTRAINT "week3_rosters_division_divisions_id_fk";
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "concern_comments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "concern_received" ALTER COLUMN "received_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "concern_replies" ALTER COLUMN "sent_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "concerns" ALTER COLUMN "anonymous" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "concerns" ALTER COLUMN "want_followup" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "concerns" ALTER COLUMN "status" SET DEFAULT 'new';--> statement-breakpoint
ALTER TABLE "concerns" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "concerns" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "deleted_signups" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "deleted_signups" ALTER COLUMN "deleted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "discounts" ALTER COLUMN "used" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "discounts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "divisions" ALTER COLUMN "active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "draft_homework" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_broadcasts" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "email_broadcasts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_broadcasts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_suppressions" ALTER COLUMN "suppressed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_suppressions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inbound_email_comments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inbound_email_received" ALTER COLUMN "received_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inbound_email_replies" ALTER COLUMN "sent_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inbound_emails" ALTER COLUMN "status" SET DEFAULT 'new';--> statement-breakpoint
ALTER TABLE "inbound_emails" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inbound_emails" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "individual_divisions" ALTER COLUMN "coaches" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "match_referees" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "match_substitutions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "playoff" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "moving_day" ALTER COLUMN "is_forced" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "moving_day" ALTER COLUMN "submitted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "player_ratings" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "score_sheets" ALTER COLUMN "uploaded_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "season_refs" ALTER COLUMN "is_certified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "season_refs" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "phase" SET DEFAULT 'off_season';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "signups" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "substitutions" ALTER COLUMN "effective_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tournament_divisions" ALTER COLUMN "teams_advancing_per_pool" SET DEFAULT 2;--> statement-breakpoint
ALTER TABLE "tournament_placements" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tournament_roster" ALTER COLUMN "added_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tournament_teams" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ALTER COLUMN "approved" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "phase" SET DEFAULT 'registration_open';--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "granted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_unavailability" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_unavailability" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "onboarding_completed" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "seasons_list" SET DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "notification_list" SET DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "captain_eligible" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "verifications" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verifications" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "waitlist" ALTER COLUMN "approved" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "waitlist" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "waiver_acceptances" ALTER COLUMN "accepted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "waivers" ALTER COLUMN "active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "waivers" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "week2_rosters" ALTER COLUMN "is_captain" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "week3_rosters" ALTER COLUMN "is_captain" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champions" ADD CONSTRAINT "champions_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champions" ADD CONSTRAINT "champions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champions" ADD CONSTRAINT "champions_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_comments" ADD CONSTRAINT "concern_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_replies" ADD CONSTRAINT "concern_replies_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concerns" ADD CONSTRAINT "concerns_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ADD CONSTRAINT "draft_capt_rounds_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ADD CONSTRAINT "draft_capt_rounds_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ADD CONSTRAINT "draft_capt_rounds_saved_by_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_capt_rounds" ADD CONSTRAINT "draft_capt_rounds_captain_users_id_fk" FOREIGN KEY ("captain") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_homework" ADD CONSTRAINT "draft_homework_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_homework" ADD CONSTRAINT "draft_homework_captain_users_id_fk" FOREIGN KEY ("captain") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_homework" ADD CONSTRAINT "draft_homework_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_homework" ADD CONSTRAINT "draft_homework_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_saved_by_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_player1_users_id_fk" FOREIGN KEY ("player1") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_pair_diffs" ADD CONSTRAINT "draft_pair_diffs_player2_users_id_fk" FOREIGN KEY ("player2") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_recipient_group_id_email_recipient_groups_id_fk" FOREIGN KEY ("recipient_group_id") REFERENCES "public"."email_recipient_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_users_id_fk" FOREIGN KEY ("evaluator") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_comments" ADD CONSTRAINT "inbound_email_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_replies" ADD CONSTRAINT "inbound_email_replies_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD CONSTRAINT "individual_divisions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_divisions" ADD CONSTRAINT "individual_divisions_divisions_divisions_id_fk" FOREIGN KEY ("divisions") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_match_matches_id_fk" FOREIGN KEY ("match") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_original_user_users_id_fk" FOREIGN KEY ("original_user") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_sub_user_users_id_fk" FOREIGN KEY ("sub_user") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_substitutions" ADD CONSTRAINT "match_substitutions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_teams_id_fk" FOREIGN KEY ("home_team") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_teams_id_fk" FOREIGN KEY ("away_team") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_teams_id_fk" FOREIGN KEY ("winner") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moving_day" ADD CONSTRAINT "moving_day_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_evaluator_users_id_fk" FOREIGN KEY ("evaluator") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matches_meta" ADD CONSTRAINT "playoff_matches_meta_work_team_teams_id_fk" FOREIGN KEY ("work_team") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_pair_pick_users_id_fk" FOREIGN KEY ("pair_pick") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_team_teams_id_fk" FOREIGN KEY ("team") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_original_draft_drafts_id_fk" FOREIGN KEY ("original_draft") REFERENCES "public"."drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_original_user_users_id_fk" FOREIGN KEY ("original_user") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_sub_user_users_id_fk" FOREIGN KEY ("sub_user") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_users_id_fk" FOREIGN KEY ("captain") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain2_users_id_fk" FOREIGN KEY ("captain2") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_divisions" ADD CONSTRAINT "tournament_divisions_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_team_id_tournament_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_work_team_id_tournament_teams_id_fk" FOREIGN KEY ("work_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_roster" ADD CONSTRAINT "tournament_roster_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_roster" ADD CONSTRAINT "tournament_roster_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_division_id_tournament_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ADD CONSTRAINT "tournament_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ADD CONSTRAINT "tournament_waitlist_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_acceptances" ADD CONSTRAINT "waiver_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_acceptances" ADD CONSTRAINT "waiver_acceptances_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week1_rosters" ADD CONSTRAINT "week1_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week1_rosters" ADD CONSTRAINT "week1_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week2_rosters" ADD CONSTRAINT "week2_rosters_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week3_rosters" ADD CONSTRAINT "week3_rosters_division_divisions_id_fk" FOREIGN KEY ("division") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "champions_season_division_uniq" ON "champions" USING btree ("season","division");--> statement-breakpoint
CREATE INDEX "champions_team_idx" ON "champions" USING btree ("team");--> statement-breakpoint
CREATE INDEX "concern_comments_concern_idx" ON "concern_comments" USING btree ("concern_id");--> statement-breakpoint
CREATE INDEX "concern_received_concern_idx" ON "concern_received" USING btree ("concern_id");--> statement-breakpoint
CREATE INDEX "concern_replies_concern_idx" ON "concern_replies" USING btree ("concern_id");--> statement-breakpoint
CREATE INDEX "concerns_status_idx" ON "concerns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "concerns_assigned_to_idx" ON "concerns" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "concerns_user_idx" ON "concerns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discounts_user_idx" ON "discounts" USING btree ("user");--> statement-breakpoint
CREATE INDEX "draft_capt_rounds_captain_idx" ON "draft_capt_rounds" USING btree ("captain");--> statement-breakpoint
CREATE INDEX "draft_homework_season_captain_division_idx" ON "draft_homework" USING btree ("season","captain","division");--> statement-breakpoint
CREATE INDEX "draft_homework_player_idx" ON "draft_homework" USING btree ("player");--> statement-breakpoint
CREATE INDEX "draft_pair_diffs_player1_idx" ON "draft_pair_diffs" USING btree ("player1");--> statement-breakpoint
CREATE INDEX "draft_pair_diffs_player2_idx" ON "draft_pair_diffs" USING btree ("player2");--> statement-breakpoint
CREATE INDEX "email_broadcasts_group_idx" ON "email_broadcasts" USING btree ("recipient_group_id");--> statement-breakpoint
CREATE INDEX "email_broadcasts_created_at_idx" ON "email_broadcasts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_recipient_groups_season_idx" ON "email_recipient_groups" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluations_season_player_evaluator_uniq" ON "evaluations" USING btree ("season","player","evaluator");--> statement-breakpoint
CREATE INDEX "evaluations_player_idx" ON "evaluations" USING btree ("player");--> statement-breakpoint
CREATE INDEX "evaluations_evaluator_idx" ON "evaluations" USING btree ("evaluator");--> statement-breakpoint
CREATE INDEX "evaluations_season_division_idx" ON "evaluations" USING btree ("season","division");--> statement-breakpoint
CREATE INDEX "inbound_email_comments_email_idx" ON "inbound_email_comments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "inbound_email_received_email_idx" ON "inbound_email_received" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "inbound_email_replies_email_idx" ON "inbound_email_replies" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_status_idx" ON "inbound_emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inbound_emails_assigned_to_idx" ON "inbound_emails" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "inbound_emails_email_id_idx" ON "inbound_emails" USING btree ("email_id");--> statement-breakpoint
CREATE UNIQUE INDEX "individual_divisions_season_division_uniq" ON "individual_divisions" USING btree ("season","divisions");--> statement-breakpoint
CREATE INDEX "moving_day_season_player_idx" ON "moving_day" USING btree ("season","player");--> statement-breakpoint
CREATE INDEX "player_ratings_player_idx" ON "player_ratings" USING btree ("player");--> statement-breakpoint
CREATE INDEX "playoff_matches_meta_season_division_idx" ON "playoff_matches_meta" USING btree ("season","division");--> statement-breakpoint
CREATE INDEX "playoff_matches_meta_match_idx" ON "playoff_matches_meta" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_code_uniq" ON "seasons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signups_season_player_uniq" ON "signups" USING btree ("season","player");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_season_user_uniq" ON "waitlist" USING btree ("season","user");--> statement-breakpoint
CREATE INDEX "waitlist_user_idx" ON "waitlist" USING btree ("user");--> statement-breakpoint
CREATE INDEX "waiver_acceptances_waiver_idx" ON "waiver_acceptances" USING btree ("waiver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "week1_rosters_season_user_uniq" ON "week1_rosters" USING btree ("season","user");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_identity_uniq" UNIQUE NULLS NOT DISTINCT("user_id","role","season_id","division_id");