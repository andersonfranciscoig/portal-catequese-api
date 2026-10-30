-- Celebrações concluídas (quem recebeu de facto).
-- AlterTable
ALTER TABLE "catechesis"."sacrament_celebrations" ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "completed_by" UUID;

-- Sacramentos recebidos (data e paróquia), um por catequizando e tipo.
-- CreateTable
CREATE TABLE "catechesis"."sacrament_records" (
    "id" UUID NOT NULL,
    "catechumen_id" UUID NOT NULL,
    "type" "catechesis"."SacramentType" NOT NULL,
    "date" TEXT,
    "parish" TEXT,
    "celebration_id" UUID,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by" UUID,

    CONSTRAINT "sacrament_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sacrament_records_type_date_idx" ON "catechesis"."sacrament_records"("type", "date");

-- CreateIndex
CREATE INDEX "sacrament_records_celebration_id_idx" ON "catechesis"."sacrament_records"("celebration_id");

-- CreateIndex
CREATE UNIQUE INDEX "sacrament_records_catechumen_id_type_key" ON "catechesis"."sacrament_records"("catechumen_id", "type");

-- AddForeignKey
ALTER TABLE "catechesis"."sacrament_records" ADD CONSTRAINT "sacrament_records_catechumen_id_fkey" FOREIGN KEY ("catechumen_id") REFERENCES "catechesis"."catechumens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."sacrament_records" ADD CONSTRAINT "sacrament_records_celebration_id_fkey" FOREIGN KEY ("celebration_id") REFERENCES "catechesis"."sacrament_celebrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Os "sim/não" que já existiam passam a registos sem data nem paróquia
-- (a mesma regra de `backfillRecords` na aplicação).
INSERT INTO "catechesis"."sacrament_records" ("id", "catechumen_id", "type", "date", "parish", "celebration_id", "recorded_at", "recorded_by")
SELECT gen_random_uuid(), "id", 'BAPTISM', NULL, NULL, NULL, "updated_at", NULL
FROM "catechesis"."catechumens"
WHERE "baptized";

INSERT INTO "catechesis"."sacrament_records" ("id", "catechumen_id", "type", "date", "parish", "celebration_id", "recorded_at", "recorded_by")
SELECT gen_random_uuid(), "id", 'FIRST_COMMUNION', NULL, NULL, NULL, "updated_at", NULL
FROM "catechesis"."catechumens"
WHERE "first_communion";
