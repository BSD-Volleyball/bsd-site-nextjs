CREATE TABLE "score_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"division_id" integer NOT NULL,
	"match_date" date NOT NULL,
	"image_path" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD CONSTRAINT "score_sheets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "score_sheets_season_div_date_idx" ON "score_sheets" USING btree ("season_id","division_id","match_date");