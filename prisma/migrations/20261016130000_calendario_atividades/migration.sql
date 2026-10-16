-- CreateEnum
CREATE TYPE "catechesis"."CalendarActivityKind" AS ENUM ('ENROLLMENT', 'MEETING', 'CATECHESIS', 'CELEBRATION');

-- CreateEnum
CREATE TYPE "catechesis"."CalendarActivityAudience" AS ENUM ('ALL', 'GUARDIANS', 'CATECHISTS');

-- CreateTable
CREATE TABLE "catechesis"."calendar_activities" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "catechesis"."CalendarActivityKind" NOT NULL,
    "audience" "catechesis"."CalendarActivityAudience" NOT NULL,
    "starts_on" TEXT NOT NULL,
    "ends_on" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "calendar_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_activities_starts_on_idx" ON "catechesis"."calendar_activities"("starts_on");
