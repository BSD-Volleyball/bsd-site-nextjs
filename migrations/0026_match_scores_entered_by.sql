ALTER TABLE "matches" ADD COLUMN "scores_entered_by" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "scores_entered_at" timestamp;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_scores_entered_by_users_id_fk" FOREIGN KEY ("scores_entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;