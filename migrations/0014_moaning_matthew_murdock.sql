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
ALTER TABLE "concern_replies" ADD COLUMN "postmark_message_id" text;--> statement-breakpoint
ALTER TABLE "inbound_email_replies" ADD COLUMN "sent_to" text NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_email_replies" ADD COLUMN "postmark_message_id" text;--> statement-breakpoint
ALTER TABLE "concern_received" ADD CONSTRAINT "concern_received_concern_id_concerns_id_fk" FOREIGN KEY ("concern_id") REFERENCES "public"."concerns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_received" ADD CONSTRAINT "inbound_email_received_email_id_inbound_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;