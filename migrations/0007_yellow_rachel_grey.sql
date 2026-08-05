DROP INDEX "email_recipient_groups_type_season_div_team_uniq";--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ADD COLUMN "event_id" integer;--> statement-breakpoint
ALTER TABLE "email_recipient_groups" ADD CONSTRAINT "email_recipient_groups_event_id_season_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."season_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_recipient_groups_type_season_div_team_uniq" ON "email_recipient_groups" USING btree ("group_type","season_id","division_id","team_id","event_id");