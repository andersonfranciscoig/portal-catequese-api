-- CreateEnum
CREATE TYPE "identity"."EmailChallengePurpose" AS ENUM ('REGISTER', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "identity"."email_challenges" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "identity"."EmailChallengePurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_challenges_email_purpose_idx" ON "identity"."email_challenges"("email", "purpose");
