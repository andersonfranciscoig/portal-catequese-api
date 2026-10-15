-- CreateEnum
CREATE TYPE "catechesis"."CatechistStatus" AS ENUM ('IN_TRAINING', 'UNAVAILABLE', 'INACTIVE');

-- AlterTable
ALTER TABLE "catechesis"."calendar" ADD COLUMN     "confirmation_ends_on" TEXT,
ADD COLUMN     "confirmation_starts_on" TEXT,
ADD COLUMN     "enrollment_ends_on" TEXT,
ADD COLUMN     "enrollment_starts_on" TEXT;

-- CreateTable
CREATE TABLE "catechesis"."catechist_profiles" (
    "account_id" UUID NOT NULL,
    "status" "catechesis"."CatechistStatus",
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "catechist_profiles_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "catechesis"."catechist_attendance" (
    "class_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "status" "catechesis"."AttendanceStatus" NOT NULL,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catechist_attendance_pkey" PRIMARY KEY ("class_id","date")
);

-- AddForeignKey
ALTER TABLE "catechesis"."catechist_attendance" ADD CONSTRAINT "catechist_attendance_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "catechesis"."classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

