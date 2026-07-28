CREATE TYPE "public"."sub_request_status" AS ENUM('pending', 'approved', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "sub_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"match" integer NOT NULL,
	"requesting_team" integer NOT NULL,
	"target_team" integer NOT NULL,
	"original_user" text NOT NULL,
	"target_user" text NOT NULL,
	"status" "sub_request_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"requested_by" text NOT NULL,
	"responded_by" text,
	"responded_at" timestamp,
	"response_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sub_requests" ADD CONSTRAINT "sub_requests_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_requests" ADD CONSTRAINT "sub_requests_match_matches_id_fk" FOREIGN KEY ("match") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_requests" ADD CONSTRAINT "sub_requests_requesting_team_teams_id_fk" FOREIGN KEY ("requesting_team") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_requests" ADD CONSTRAINT "sub_requests_target_team_teams_id_fk" FOREIGN KEY ("target_team") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_requests" ADD CONSTRAINT "sub_requests_original_user_users_id_fk" FOREIGN KEY ("original_user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_requests" ADD CONSTRAINT "sub_requests_target_user_users_id_fk" FOREIGN KEY ("target_user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_requests" ADD CONSTRAINT "sub_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_requests" ADD CONSTRAINT "sub_requests_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sub_requests_match_idx" ON "sub_requests" USING btree ("match");--> statement-breakpoint
CREATE INDEX "sub_requests_requesting_team_idx" ON "sub_requests" USING btree ("requesting_team");--> statement-breakpoint
CREATE INDEX "sub_requests_target_team_idx" ON "sub_requests" USING btree ("target_team");--> statement-breakpoint
CREATE INDEX "sub_requests_season_idx" ON "sub_requests" USING btree ("season");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_requests_pending_uniq" ON "sub_requests" USING btree ("match","original_user","target_user") WHERE "sub_requests"."status" = 'pending';