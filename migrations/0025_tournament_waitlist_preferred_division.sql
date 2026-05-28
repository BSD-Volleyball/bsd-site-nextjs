-- Optional preferred-division hint captured when a player signs up to play.
-- Admins see it on the Place Tournament Players page; it doesn't constrain
-- which team a player can be placed on.
ALTER TABLE "tournament_waitlist" ADD COLUMN "preferred_division_id" integer;--> statement-breakpoint
ALTER TABLE "tournament_waitlist" ADD CONSTRAINT "tournament_waitlist_preferred_division_id_tournament_divisions_id_fk" FOREIGN KEY ("preferred_division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE set null ON UPDATE no action;
