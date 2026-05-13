CREATE TABLE "waiver_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"waiver_id" integer NOT NULL,
	"accepted_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "waiver_acceptances" ADD CONSTRAINT "waiver_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_acceptances" ADD CONSTRAINT "waiver_acceptances_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_acceptances_user_waiver_idx" ON "waiver_acceptances" USING btree ("user_id","waiver_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_waiver_content_edit() RETURNS trigger AS $$
BEGIN
    IF NEW.content IS DISTINCT FROM OLD.content
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'waivers.content/created_at/id are immutable; create a new version instead';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER waivers_immutable
BEFORE UPDATE ON "waivers"
FOR EACH ROW EXECUTE FUNCTION prevent_waiver_content_edit();