CREATE TABLE "score_sheet_score_samples" (
	"id" serial PRIMARY KEY NOT NULL,
	"read_id" integer NOT NULL,
	"crop_id" text NOT NULL,
	"match_id" integer,
	"image_path" text NOT NULL,
	"predicted" integer,
	"predicted_confidence" numeric,
	"confirmed" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_sheet_score_samples" ADD CONSTRAINT "score_sheet_score_samples_read_id_score_sheet_reads_id_fk" FOREIGN KEY ("read_id") REFERENCES "public"."score_sheet_reads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "score_sheet_score_samples_crop_uniq" ON "score_sheet_score_samples" USING btree ("read_id","crop_id");--> statement-breakpoint
CREATE INDEX "score_sheet_score_samples_confirmed_idx" ON "score_sheet_score_samples" USING btree ("confirmed");