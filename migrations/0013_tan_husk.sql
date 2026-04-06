CREATE TABLE "concern_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"concern_id" integer NOT NULL,
	"sent_by" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"sent_to" text NOT NULL,
	"sent_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "concern_replies" ADD CONSTRAINT "concern_replies_concern_id_concerns_id_fk" FOREIGN KEY ("concern_id") REFERENCES "public"."concerns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_replies" ADD CONSTRAINT "concern_replies_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;