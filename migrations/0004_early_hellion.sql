CREATE TABLE "tryout_slot_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"user_id" text NOT NULL,
	"week" integer NOT NULL,
	"can_slot_1" boolean DEFAULT false NOT NULL,
	"can_slot_2" boolean DEFAULT false NOT NULL,
	"can_slot_3" boolean DEFAULT false NOT NULL,
	"comment" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tryout_slot_requests" ADD CONSTRAINT "tryout_slot_requests_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_slot_requests" ADD CONSTRAINT "tryout_slot_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_slot_requests" ADD CONSTRAINT "tryout_slot_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tryout_slot_requests_season_idx" ON "tryout_slot_requests" USING btree ("season");--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_slot_requests_season_user_week_unique" ON "tryout_slot_requests" USING btree ("season","user_id","week");