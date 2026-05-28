-- tournament_divisions: replace ad-hoc (name, level) columns with a FK to the
-- league-wide `divisions` table so division identity (e.g. "A", "BB") and
-- sort order come from a single source of truth.
--
-- Safe destructive: tournament_divisions has no production data yet at the
-- time this migration is authored.

ALTER TABLE "tournament_divisions" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "tournament_divisions" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "tournament_divisions" ADD COLUMN "division_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_divisions" ADD CONSTRAINT "tournament_divisions_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_divisions_tournament_division_uniq" ON "tournament_divisions" USING btree ("tournament_id","division_id");
