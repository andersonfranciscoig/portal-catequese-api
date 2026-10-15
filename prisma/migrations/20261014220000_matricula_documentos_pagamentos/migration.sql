-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "payments";

-- CreateEnum
CREATE TYPE "catechesis"."EnrollmentDocumentKind" AS ENUM ('ID', 'BAPTISM', 'PHOTO');

-- CreateEnum
CREATE TYPE "payments"."PaymentPurpose" AS ENUM ('ENROLLMENT', 'CONFIRMATION');

-- CreateEnum
CREATE TYPE "payments"."PaymentMethod" AS ENUM ('EXPRESS_REFERENCE', 'BANK_TRANSFER', 'CASH');

-- CreateEnum
CREATE TYPE "payments"."PaymentStatus" AS ENUM ('AWAITING_PAYMENT', 'UNDER_REVIEW', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "catechesis"."enrollments" ADD COLUMN     "documents_in_person" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "history" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "previous_enrollment_id" UUID,
ADD COLUMN     "review_note" TEXT;

-- CreateTable
CREATE TABLE "catechesis"."enrollment_documents" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "kind" "catechesis"."EnrollmentDocumentKind" NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollment_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."settings" (
    "id" TEXT NOT NULL,
    "enrollment_price" INTEGER NOT NULL,
    "confirmation_price" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."bank_accounts" (
    "id" UUID NOT NULL,
    "bank" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."payments" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "enrollment_code" TEXT NOT NULL,
    "catechumen_name" TEXT NOT NULL,
    "purpose" "payments"."PaymentPurpose" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "payments"."PaymentStatus" NOT NULL,
    "method" "payments"."PaymentMethod",
    "payer_account_ids" UUID[],
    "proof_file_key" TEXT,
    "proof_file_name" TEXT,
    "proof_file_size" INTEGER,
    "proof_content_type" TEXT,
    "proof_bank_account_id" UUID,
    "proof_submitted_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "reviewed_by" UUID,
    "registered_by_coordination" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_documents_enrollment_id_kind_key" ON "catechesis"."enrollment_documents"("enrollment_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "payments_enrollment_id_key" ON "payments"."payments"("enrollment_id");

-- CreateIndex
CREATE INDEX "payments_enrollment_code_idx" ON "payments"."payments"("enrollment_code");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"."payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_previous_enrollment_id_key" ON "catechesis"."enrollments"("previous_enrollment_id");

-- AddForeignKey
ALTER TABLE "catechesis"."enrollment_documents" ADD CONSTRAINT "enrollment_documents_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "catechesis"."enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

