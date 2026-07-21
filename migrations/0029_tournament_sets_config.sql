ALTER TABLE "tournaments" ADD COLUMN "pool_sets_mode" text DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "pool_sets_count" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "playoff_sets_mode" text DEFAULT 'best_of' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "playoff_sets_count" integer DEFAULT 3 NOT NULL;
