-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateEnum
CREATE TYPE "audit"."ActivityCategory" AS ENUM ('AUTH', 'ENROLLMENT', 'FINANCE', 'SETTINGS', 'CATECHISTS', 'ADMIN');

-- CreateEnum
CREATE TYPE "identity"."AccountStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "platform"."LaunchMode" AS ENUM ('BETA', 'PUBLIC');

-- CreateEnum
CREATE TYPE "platform"."AccessProfile" AS ENUM ('GUARDIAN', 'CATECHUMEN', 'CATECHIST', 'COORDINATION');

-- CreateEnum
CREATE TYPE "platform"."AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "identity"."Permission" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "identity"."Permission" ADD VALUE 'FINANCE';
ALTER TYPE "identity"."Permission" ADD VALUE 'LATE_ENROLLMENT';
ALTER TYPE "identity"."Permission" ADD VALUE 'APPROVE_CATECHISTS';

-- AlterTable
ALTER TABLE "identity"."accounts" ADD COLUMN     "beta_access" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blocked_at" TIMESTAMPTZ(3),
ADD COLUMN     "blocked_reason" TEXT,
ADD COLUMN     "status" "identity"."AccountStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "audit"."activity" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "category" "audit"."ActivityCategory" NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "target_account_id" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."settings" (
    "id" TEXT NOT NULL,
    "launch_mode" "platform"."LaunchMode" NOT NULL DEFAULT 'BETA',
    "launch_changed_at" TIMESTAMPTZ(3),
    "launch_changed_by" UUID,
    "portal_open" BOOLEAN NOT NULL DEFAULT true,
    "closed_message" TEXT,
    "reopens_at" TEXT,
    "portal_changed_at" TIMESTAMPTZ(3),
    "portal_changed_by" UUID,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."access_requests" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "profile" "platform"."AccessProfile" NOT NULL,
    "message" TEXT,
    "status" "platform"."AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" UUID,
    "decision_note" TEXT,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_at_idx" ON "audit"."activity"("at");

-- CreateIndex
CREATE INDEX "activity_actor_id_at_idx" ON "audit"."activity"("actor_id", "at");

-- CreateIndex
CREATE INDEX "activity_target_account_id_at_idx" ON "audit"."activity"("target_account_id", "at");

-- CreateIndex
CREATE INDEX "access_requests_phone_idx" ON "platform"."access_requests"("phone");

-- CreateIndex
CREATE INDEX "access_requests_email_idx" ON "platform"."access_requests"("email");

-- CreateIndex
CREATE INDEX "access_requests_status_created_at_idx" ON "platform"."access_requests"("status", "created_at");
