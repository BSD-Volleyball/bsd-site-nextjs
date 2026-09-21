CREATE TABLE "score_sheet_prints" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"season_id" integer NOT NULL,
	"match_date" date NOT NULL,
	"court" integer,
	"template_version" integer NOT NULL,
	"event_type" text NOT NULL,
	"match_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generated_by" text
);
--> statement-breakpoint
ALTER TABLE "score_sheet_prints" ADD CONSTRAINT "score_sheet_prints_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_prints" ADD CONSTRAINT "score_sheet_prints_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "score_sheet_prints_tag_uniq" ON "score_sheet_prints" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "score_sheet_prints_date_idx" ON "score_sheet_prints" USING btree ("season_id","match_date");