CREATE TABLE "deleted_signups" (
	"id" integer PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"player" text NOT NULL,
	"age" text,
	"captain" text,
	"pair" boolean,
	"pair_pick" text,
	"pair_reason" text,
	"order_id" text,
	"amount_paid" numeric,
	"created_at" timestamp NOT NULL,
	"deleted_at" timestamp NOT NULL,
	"deleted_by" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD CONSTRAINT "deleted_signups_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deleted_signups_season_idx" ON "deleted_signups" USING btree ("season");--> statement-breakpoint
CREATE INDEX "deleted_signups_player_idx" ON "deleted_signups" USING btree ("player");