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
ALTER TABLE "email_broadcasts" DROP CONSTRAINT "email_broadcasts_segment_id_resend_segments_id_fk";
--> statement-breakpoint
ALTER TABLE "email_broadcasts" DROP CONSTRAINT "email_broadcasts_topic_id_resend_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "resend_segments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resend_topics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "resend_segments" CASCADE;--> statement-breakpoint
DROP TABLE "resend_topics" CASCADE;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD COLUMN "recipient_group_id" integer;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD COLUMN "stream_id" text;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD COLUMN "sent_count" integer;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD COLUMN "failed_count" integer;--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ADD CONSTRAINT "email_recipient_groups_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ADD CONSTRAINT "email_recipient_groups_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ADD CONSTRAINT "email_recipient_groups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_recipient_groups_type_season_div_team_uniq" ON "email_recipient_groups" USING btree ("group_type","season_id","division_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_email_stream_uniq" ON "email_suppressions" USING btree ("email","stream_id");--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_recipient_group_id_email_recipient_groups_id_fk" FOREIGN KEY ("recipient_group_id") REFERENCES "public"."email_recipient_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_broadcasts" DROP COLUMN "resend_broadcast_id";--> statement-breakpoint
ALTER TABLE "email_broadcasts" DROP COLUMN "segment_id";--> statement-breakpoint
ALTER TABLE "email_broadcasts" DROP COLUMN "topic_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "resend_contact_id";