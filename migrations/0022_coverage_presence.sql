CREATE TABLE "coverage_presence" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_date" date NOT NULL,
	"slot_time" time NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coverage_presence" ADD CONSTRAINT "coverage_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_presence" ADD CONSTRAINT "coverage_presence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_presence_user_date_slot_uniq" ON "coverage_presence" USING btree ("user_id","event_date","slot_time");--> statement-breakpoint
CREATE INDEX "coverage_presence_date_idx" ON "coverage_presence" USING btree ("event_date");