-- Centros de catequese. Cada centro gere a sua catequese.
-- Os dados já existentes ficam no Centro Sede. Nada é apagado.

-- CreateEnum
CREATE TYPE "catechesis"."CenterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "catechesis"."centers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "catechesis"."CenterStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "centers_pkey" PRIMARY KEY ("id")
);

INSERT INTO "catechesis"."centers" ("id", "name", "location", "status", "created_at", "updated_at")
VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Centro Sede', 'Sede da paróquia', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000002', 'Santa Teresinha', 'Santa Teresinha', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000003', 'Santo Expedito', 'Santo Expedito', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "catechesis"."catechumens" ADD COLUMN "center_id" UUID;
ALTER TABLE "catechesis"."enrollments" ADD COLUMN "center_id" UUID;
ALTER TABLE "catechesis"."classes" ADD COLUMN "center_id" UUID;
ALTER TABLE "catechesis"."catechist_profiles" ADD COLUMN "center_id" UUID;
ALTER TABLE "catechesis"."sacrament_celebrations" ADD COLUMN "center_id" UUID;
ALTER TABLE "catechesis"."announcements" ADD COLUMN "center_id" UUID;
ALTER TABLE "payments"."payments" ADD COLUMN "center_id" UUID;
ALTER TABLE "identity"."accounts" ADD COLUMN "coordination_center_id" UUID;
ALTER TABLE "messaging"."conversations" ADD COLUMN "center_id" UUID;

-- Os dados atuais passam para o Centro Sede.
UPDATE "catechesis"."catechumens" SET "center_id" = 'a1000000-0000-4000-8000-000000000001' WHERE "center_id" IS NULL;
UPDATE "catechesis"."enrollments" SET "center_id" = 'a1000000-0000-4000-8000-000000000001' WHERE "center_id" IS NULL;
UPDATE "catechesis"."classes" SET "center_id" = 'a1000000-0000-4000-8000-000000000001' WHERE "center_id" IS NULL;
UPDATE "catechesis"."catechist_profiles" SET "center_id" = 'a1000000-0000-4000-8000-000000000001' WHERE "center_id" IS NULL;
UPDATE "catechesis"."sacrament_celebrations" SET "center_id" = 'a1000000-0000-4000-8000-000000000001' WHERE "center_id" IS NULL;
UPDATE "catechesis"."announcements" SET "center_id" = 'a1000000-0000-4000-8000-000000000001' WHERE "center_id" IS NULL;

-- Pagamentos: o centro da matrícula, depois de esta já ter centro.
UPDATE "payments"."payments" AS payment
SET "center_id" = enrollment."center_id"
FROM "catechesis"."enrollments" AS enrollment
WHERE payment."enrollment_id" = enrollment."id"
  AND payment."center_id" IS NULL;

UPDATE "payments"."payments"
SET "center_id" = 'a1000000-0000-4000-8000-000000000001'
WHERE "center_id" IS NULL;

-- Conversas de coordenação existentes ficam no Centro Sede. As diretas continuam sem centro.
UPDATE "messaging"."conversations"
SET "center_id" = 'a1000000-0000-4000-8000-000000000001'
WHERE "kind" = 'COORDINATION' AND "center_id" IS NULL;

-- AlterTable
ALTER TABLE "catechesis"."catechumens" ALTER COLUMN "center_id" SET NOT NULL;
ALTER TABLE "catechesis"."enrollments" ALTER COLUMN "center_id" SET NOT NULL;
ALTER TABLE "catechesis"."classes" ALTER COLUMN "center_id" SET NOT NULL;
ALTER TABLE "catechesis"."catechist_profiles" ALTER COLUMN "center_id" SET NOT NULL;
ALTER TABLE "catechesis"."sacrament_celebrations" ALTER COLUMN "center_id" SET NOT NULL;
ALTER TABLE "catechesis"."announcements" ALTER COLUMN "center_id" SET NOT NULL;
ALTER TABLE "payments"."payments" ALTER COLUMN "center_id" SET NOT NULL;

-- A turma passa a ser única também por centro.
DROP INDEX "catechesis"."classes_catechetical_year_level_section_key";

-- CreateIndex
CREATE UNIQUE INDEX "classes_catechetical_year_level_section_center_id_key" ON "catechesis"."classes"("catechetical_year", "level", "section", "center_id");

-- CreateIndex
CREATE INDEX "catechumens_center_id_idx" ON "catechesis"."catechumens"("center_id");
CREATE INDEX "enrollments_center_id_idx" ON "catechesis"."enrollments"("center_id");
CREATE INDEX "classes_center_id_idx" ON "catechesis"."classes"("center_id");
CREATE INDEX "catechist_profiles_center_id_idx" ON "catechesis"."catechist_profiles"("center_id");
CREATE INDEX "sacrament_celebrations_center_id_idx" ON "catechesis"."sacrament_celebrations"("center_id");
CREATE INDEX "announcements_center_id_idx" ON "catechesis"."announcements"("center_id");
CREATE INDEX "payments_center_id_idx" ON "payments"."payments"("center_id");

-- Uma conversa de coordenação por conta e centro (as diretas ficam com centro nulo).
DROP INDEX "messaging"."conversations_subject_account_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "conversations_subject_account_id_center_id_key" ON "messaging"."conversations"("subject_account_id", "center_id");

-- AddForeignKey
ALTER TABLE "catechesis"."catechumens" ADD CONSTRAINT "catechumens_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "catechesis"."centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catechesis"."enrollments" ADD CONSTRAINT "enrollments_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "catechesis"."centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catechesis"."classes" ADD CONSTRAINT "classes_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "catechesis"."centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catechesis"."catechist_profiles" ADD CONSTRAINT "catechist_profiles_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "catechesis"."centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catechesis"."sacrament_celebrations" ADD CONSTRAINT "sacrament_celebrations_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "catechesis"."centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catechesis"."announcements" ADD CONSTRAINT "announcements_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "catechesis"."centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
