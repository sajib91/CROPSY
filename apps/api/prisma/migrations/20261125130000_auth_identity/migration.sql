-- Allow phone-only accounts while keeping non-null emails unique.
-- The baseline migration remains immutable; this is a follow-up change.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_email_not_null_key" ON "users"("email") WHERE "email" IS NOT NULL;

-- Account recovery uses a distinct OTP purpose.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'ACCOUNT_RECOVERY';
