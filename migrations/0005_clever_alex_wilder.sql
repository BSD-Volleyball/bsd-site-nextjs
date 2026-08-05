ALTER TABLE "deleted_signups" ADD COLUMN "ref_interest" boolean;--> statement-breakpoint
ALTER TABLE "deleted_signups" ADD COLUMN "tryout_help" boolean;--> statement-breakpoint
ALTER TABLE "signups" ADD COLUMN "ref_interest" boolean;--> statement-breakpoint
ALTER TABLE "signups" ADD COLUMN "tryout_help" boolean;