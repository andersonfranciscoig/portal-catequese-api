-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateEnum
CREATE TYPE "identity"."AccountRole" AS ENUM ('GUARDIAN', 'CATECHUMEN', 'CATECHIST');

-- CreateEnum
CREATE TYPE "identity"."AccountApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "identity"."Permission" AS ENUM ('COORDINATION');

-- CreateTable
CREATE TABLE "identity"."accounts" (
    "id" UUID NOT NULL,
    "role" "identity"."AccountRole" NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "approval" "identity"."AccountApproval",
    "permissions" "identity"."Permission"[],
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_phone_key" ON "identity"."accounts"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "identity"."accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "identity"."sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_idx" ON "identity"."sessions"("account_id");

-- AddForeignKey
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
