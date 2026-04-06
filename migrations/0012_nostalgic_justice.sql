CREATE TABLE "inbound_email_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"sent_by" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"sent_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbound_email_replies" ADD CONSTRAINT "inbound_email_replies_email_id_inbound_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_replies" ADD CONSTRAINT "inbound_email_replies_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;