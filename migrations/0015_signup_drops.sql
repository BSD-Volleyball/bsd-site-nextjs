CREATE TABLE "signup_drops" (
	"id" serial PRIMARY KEY NOT NULL,
	"signup_id" integer NOT NULL,
	"stage" text NOT NULL,
	"season" integer NOT NULL,
	"player" text NOT NULL,
	"age" text,
	"captain" text,
	"pair" boolean,
	"pair_pick" text,
	"pair_reason" text,
	"ref_interest" boolean,
	"tryout_help" boolean,
	"order_id" text,
	"amount_paid" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reason_category" text NOT NULL,
	"reason_note" text,
	"unavailability_event_ids" jsonb,
	"draft_homework_snapshot" jsonb,
	"discount_id" integer,
	"team_name" text,
	"division_name" text,
	"dropped_at" timestamp DEFAULT now() NOT NULL,
	"dropped_by" text NOT NULL,
	"restored_at" timestamp,
	"restored_by" text
);
--> statement-breakpoint
ALTER TABLE "signup_drops" ADD CONSTRAINT "signup_drops_season_seasons_id_fk" FOREIGN KEY ("season") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_drops" ADD CONSTRAINT "signup_drops_player_users_id_fk" FOREIGN KEY ("player") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_drops" ADD CONSTRAINT "signup_drops_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_drops" ADD CONSTRAINT "signup_drops_dropped_by_users_id_fk" FOREIGN KEY ("dropped_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_drops" ADD CONSTRAINT "signup_drops_restored_by_users_id_fk" FOREIGN KEY ("restored_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signup_drops_season_idx" ON "signup_drops" USING btree ("season");--> statement-breakpoint
CREATE INDEX "signup_drops_player_idx" ON "signup_drops" USING btree ("player");--> statement-breakpoint
CREATE INDEX "signup_drops_signup_idx" ON "signup_drops" USING btree ("signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signup_drops_active_uniq" ON "signup_drops" USING btree ("season","player") WHERE "signup_drops"."restored_at" IS NULL;--> statement-breakpoint
INSERT INTO "signup_drops" ("signup_id", "stage", "season", "player", "age", "captain", "pair", "pair_pick", "pair_reason", "ref_interest", "tryout_help", "order_id", "amount_paid", "created_at", "reason_category", "reason_note", "dropped_at", "dropped_by")
SELECT "id", 'pre_draft', "season", "player", "age", "captain", "pair", "pair_pick", "pair_reason", "ref_interest", "tryout_help", "order_id", "amount_paid", "created_at", 'other', "reason", "deleted_at", "deleted_by"
FROM "deleted_signups";
