CREATE TABLE "survey_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"response_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"value_bool" boolean,
	"value_number" integer,
	"value_text" text,
	"value_options" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"help_text" text,
	"required" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"visibility" jsonb DEFAULT '{"conditions":[],"roleTags":[]}'::jsonb NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"division_id" integer,
	"gender" text,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp,
	"removed_at" timestamp,
	"added_by" text
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"user_id" text,
	"recipient_id" integer,
	"role_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"division_id" integer,
	"gender" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"season_id" integer,
	"title" text NOT NULL,
	"intro" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"audience" jsonb DEFAULT '{"groups":[],"addUserIds":[],"removeUserIds":[]}'::jsonb NOT NULL,
	"question_ids" jsonb,
	"opens_at" timestamp,
	"closes_at" timestamp,
	"reminder_interval_days" integer DEFAULT 0 NOT NULL,
	"reminder_max_count" integer DEFAULT 0 NOT NULL,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp,
	"published_at" timestamp,
	"closed_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_response_id_survey_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_question_id_survey_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_template_id_survey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."survey_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_recipients" ADD CONSTRAINT "survey_recipients_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_recipients" ADD CONSTRAINT "survey_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_recipients" ADD CONSTRAINT "survey_recipients_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_recipients" ADD CONSTRAINT "survey_recipients_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_recipient_id_survey_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."survey_recipients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_templates" ADD CONSTRAINT "survey_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_template_id_survey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."survey_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_answers_response_question_uniq" ON "survey_answers" USING btree ("response_id","question_id");--> statement-breakpoint
CREATE INDEX "survey_answers_question_idx" ON "survey_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "survey_questions_template_order_idx" ON "survey_questions" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_recipients_survey_user_uniq" ON "survey_recipients" USING btree ("survey_id","user_id");--> statement-breakpoint
CREATE INDEX "survey_recipients_user_idx" ON "survey_recipients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "survey_responses_survey_status_idx" ON "survey_responses" USING btree ("survey_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_responses_survey_user_uniq" ON "survey_responses" USING btree ("survey_id","user_id") WHERE "survey_responses"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "surveys_template_idx" ON "surveys" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "surveys_season_idx" ON "surveys" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "surveys_status_idx" ON "surveys" USING btree ("status");