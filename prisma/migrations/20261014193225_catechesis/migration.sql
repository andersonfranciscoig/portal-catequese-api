-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catechesis";

-- CreateEnum
CREATE TYPE "catechesis"."CatechesisLevel" AS ENUM ('BAPTISM_PRE', 'BAPTISM_1', 'BAPTISM_2', 'BAPTISM_3', 'COMMUNION_PRE', 'COMMUNION_1', 'COMMUNION_2', 'COMMUNION_3', 'BIBLICAL', 'CONFIRMATION_1', 'CONFIRMATION_2', 'CONFIRMATION_3');

-- CreateEnum
CREATE TYPE "catechesis"."SessionSlot" AS ENUM ('SATURDAY_MORNING', 'SATURDAY_AFTERNOON', 'SUNDAY_AFTER_MASS');

-- CreateEnum
CREATE TYPE "catechesis"."Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "catechesis"."GuardianRelationship" AS ENUM ('FATHER', 'MOTHER', 'GRANDPARENT', 'UNCLE_AUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "catechesis"."EnrollmentStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'WAITLIST');

-- CreateEnum
CREATE TYPE "catechesis"."EnrollmentType" AS ENUM ('NEW', 'RENEWAL', 'TRANSFER');

-- CreateEnum
CREATE TYPE "catechesis"."ClassCatechistRole" AS ENUM ('LEAD', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "catechesis"."AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'JUSTIFIED');

-- CreateEnum
CREATE TYPE "catechesis"."YearOutcome" AS ENUM ('PASSED', 'REPEAT');

-- CreateTable
CREATE TABLE "catechesis"."calendar" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "starts_on" TEXT NOT NULL,
    "ends_on" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catechesis"."catechumens" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "birth_date" TEXT NOT NULL,
    "gender" "catechesis"."Gender" NOT NULL,
    "address" TEXT,
    "baptized" BOOLEAN NOT NULL,
    "first_communion" BOOLEAN NOT NULL,
    "guardian_account_id" UUID,
    "guardian_relationship" "catechesis"."GuardianRelationship",
    "account_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catechumens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catechesis"."enrollments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "catechumen_id" UUID NOT NULL,
    "catechetical_year" TEXT NOT NULL,
    "level" "catechesis"."CatechesisLevel" NOT NULL,
    "type" "catechesis"."EnrollmentType" NOT NULL,
    "status" "catechesis"."EnrollmentStatus" NOT NULL,
    "preferred_slot" "catechesis"."SessionSlot" NOT NULL,
    "previous_parish" TEXT,
    "notes" TEXT,
    "submitted_by" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "class_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catechesis"."classes" (
    "id" UUID NOT NULL,
    "catechetical_year" TEXT NOT NULL,
    "level" "catechesis"."CatechesisLevel" NOT NULL,
    "section" TEXT NOT NULL,
    "slot" "catechesis"."SessionSlot" NOT NULL,
    "start_time" TEXT,
    "room" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catechesis"."class_catechists" (
    "class_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role" "catechesis"."ClassCatechistRole" NOT NULL,

    CONSTRAINT "class_catechists_pkey" PRIMARY KEY ("class_id","account_id")
);

-- CreateTable
CREATE TABLE "catechesis"."attendance" (
    "class_id" UUID NOT NULL,
    "catechumen_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "status" "catechesis"."AttendanceStatus" NOT NULL,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("class_id","date","catechumen_id")
);

-- CreateTable
CREATE TABLE "catechesis"."evaluations" (
    "class_id" UUID NOT NULL,
    "catechumen_id" UUID NOT NULL,
    "t1" DOUBLE PRECISION,
    "t2" DOUBLE PRECISION,
    "t3" DOUBLE PRECISION,
    "outcome" "catechesis"."YearOutcome",
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("class_id","catechumen_id")
);

-- CreateIndex
CREATE INDEX "catechumens_guardian_account_id_idx" ON "catechesis"."catechumens"("guardian_account_id");

-- CreateIndex
CREATE INDEX "catechumens_account_id_idx" ON "catechesis"."catechumens"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_code_key" ON "catechesis"."enrollments"("code");

-- CreateIndex
CREATE INDEX "enrollments_catechetical_year_status_idx" ON "catechesis"."enrollments"("catechetical_year", "status");

-- CreateIndex
CREATE INDEX "enrollments_class_id_idx" ON "catechesis"."enrollments"("class_id");

-- CreateIndex
CREATE INDEX "enrollments_submitted_by_idx" ON "catechesis"."enrollments"("submitted_by");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_catechumen_id_catechetical_year_key" ON "catechesis"."enrollments"("catechumen_id", "catechetical_year");

-- CreateIndex
CREATE UNIQUE INDEX "classes_catechetical_year_level_section_key" ON "catechesis"."classes"("catechetical_year", "level", "section");

-- CreateIndex
CREATE INDEX "class_catechists_account_id_idx" ON "catechesis"."class_catechists"("account_id");

-- CreateIndex
CREATE INDEX "attendance_catechumen_id_idx" ON "catechesis"."attendance"("catechumen_id");

-- AddForeignKey
ALTER TABLE "catechesis"."enrollments" ADD CONSTRAINT "enrollments_catechumen_id_fkey" FOREIGN KEY ("catechumen_id") REFERENCES "catechesis"."catechumens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "catechesis"."classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."class_catechists" ADD CONSTRAINT "class_catechists_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "catechesis"."classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."attendance" ADD CONSTRAINT "attendance_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "catechesis"."classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."evaluations" ADD CONSTRAINT "evaluations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "catechesis"."classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
