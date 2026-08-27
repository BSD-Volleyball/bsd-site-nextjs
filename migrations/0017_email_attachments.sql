CREATE TABLE "email_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_type" text NOT NULL,
	"parent_id" integer NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"r2_key" text NOT NULL,
	"content_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_attachments_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE INDEX "email_attachments_parent_idx" ON "email_attachments" USING btree ("parent_type","parent_id");