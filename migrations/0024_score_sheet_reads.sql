CREATE TABLE "score_sheet_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"score_sheet_id" integer NOT NULL,
	"status" text NOT NULL,
	"tag" text,
	"template_version" integer,
	"print_id" integer,
	"result" jsonb,
	"problems" text[] DEFAULT '{}'::text[] NOT NULL,
	"transcriber" text,
	"residual_pt" numeric,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"confirmed_at" timestamp,
	"confirmed_by" text
);
--> statement-breakpoint
ALTER TABLE "score_sheets" ALTER COLUMN "division_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "score_sheets" ADD COLUMN "court" integer;--> statement-breakpoint
ALTER TABLE "score_sheet_reads" ADD CONSTRAINT "score_sheet_reads_score_sheet_id_score_sheets_id_fk" FOREIGN KEY ("score_sheet_id") REFERENCES "public"."score_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_reads" ADD CONSTRAINT "score_sheet_reads_print_id_score_sheet_prints_id_fk" FOREIGN KEY ("print_id") REFERENCES "public"."score_sheet_prints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_reads" ADD CONSTRAINT "score_sheet_reads_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "score_sheet_reads_sheet_uniq" ON "score_sheet_reads" USING btree ("score_sheet_id");--> statement-breakpoint
CREATE INDEX "score_sheet_reads_status_idx" ON "score_sheet_reads" USING btree ("status");