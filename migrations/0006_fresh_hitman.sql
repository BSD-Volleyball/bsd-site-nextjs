CREATE TABLE "inbound_email_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp NOT NULL
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
ALTER TABLE "concerns" ADD COLUMN "source" text NOT NULL DEFAULT 'web';--> statement-breakpoint
ALTER TABLE "concerns" ADD COLUMN "source_email_id" text;--> statement-breakpoint
ALTER TABLE "inbound_email_comments" ADD CONSTRAINT "inbound_email_comments_email_id_inbound_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_comments" ADD CONSTRAINT "inbound_email_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;