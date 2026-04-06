CREATE TABLE "email_broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"resend_broadcast_id" text,
	"segment_id" integer NOT NULL,
	"topic_id" integer,
	"template_id" integer,
	"subject" text NOT NULL,
	"html_content" text NOT NULL,
	"lexical_content" jsonb NOT NULL,
	"sent_by" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"sent_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resend_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"resend_segment_id" text NOT NULL,
	"segment_type" text NOT NULL,
	"season_id" integer,
	"division_id" integer,
	"team_id" integer,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "resend_segments_resend_segment_id_unique" UNIQUE("resend_segment_id")
);
--> statement-breakpoint
CREATE TABLE "resend_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_type" text NOT NULL,
	"name" text NOT NULL,
	"resend_topic_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "resend_topics_topic_type_unique" UNIQUE("topic_type"),
	CONSTRAINT "resend_topics_resend_topic_id_unique" UNIQUE("resend_topic_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "resend_contact_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "unsubscribed" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_segment_id_resend_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."resend_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_topic_id_resend_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."resend_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resend_segments" ADD CONSTRAINT "resend_segments_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resend_segments" ADD CONSTRAINT "resend_segments_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resend_segments" ADD CONSTRAINT "resend_segments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resend_segments_type_season_div_team_uniq" ON "resend_segments" USING btree ("segment_type","season_id","division_id","team_id");