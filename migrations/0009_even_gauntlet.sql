CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled', 'removed');--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" serial PRIMARY KEY NOT NULL,
	"requester" text NOT NULL,
	"addressee" text NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_no_self" CHECK ("friendships"."requester" <> "friendships"."addressee")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_users_id_fk" FOREIGN KEY ("requester") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_users_id_fk" FOREIGN KEY ("addressee") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friendships_requester_idx" ON "friendships" USING btree ("requester");--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_live_pair_uniq" ON "friendships" USING btree (least("requester", "addressee"),greatest("requester", "addressee")) WHERE "friendships"."status" IN ('pending', 'accepted');