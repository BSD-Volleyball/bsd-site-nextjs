ALTER TABLE "users" RENAME COLUMN "unsubscribed" TO "email_status";
-- Convert boolean to text, preserving existing unsubscribed state
ALTER TABLE "users" ALTER COLUMN "email_status" TYPE text USING CASE WHEN "email_status" = true THEN 'unsubscribed' ELSE 'valid' END;
ALTER TABLE "users" ALTER COLUMN "email_status" SET DEFAULT 'valid';
ALTER TABLE "users" ALTER COLUMN "email_status" SET NOT NULL;
