-- Várias celebrações por sacramento e ano: cada linha atual passa a uma
-- celebração automática (sem turmas nem catequizandos escolhidos) com id novo.
-- AlterTable
ALTER TABLE "catechesis"."sacrament_celebrations" DROP CONSTRAINT "sacrament_celebrations_pkey",
ADD COLUMN     "created_at" TIMESTAMPTZ(3),
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "id" UUID,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "time" TEXT;

UPDATE "catechesis"."sacrament_celebrations"
SET "id" = gen_random_uuid(),
    "created_at" = "updated_at",
    "created_by" = "updated_by";

ALTER TABLE "catechesis"."sacrament_celebrations"
ALTER COLUMN "id" SET NOT NULL,
ALTER COLUMN "created_at" SET NOT NULL,
ADD CONSTRAINT "sacrament_celebrations_pkey" PRIMARY KEY ("id");

-- Mensagens automáticas do portal (sem remetente).
-- AlterTable
ALTER TABLE "messaging"."messages" ADD COLUMN     "automated" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "sender_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "catechesis"."sacrament_celebration_classes" (
    "celebration_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,

    CONSTRAINT "sacrament_celebration_classes_pkey" PRIMARY KEY ("celebration_id","class_id")
);

-- CreateTable
CREATE TABLE "catechesis"."sacrament_celebration_catechumens" (
    "celebration_id" UUID NOT NULL,
    "catechumen_id" UUID NOT NULL,

    CONSTRAINT "sacrament_celebration_catechumens_pkey" PRIMARY KEY ("celebration_id","catechumen_id")
);

-- CreateTable
CREATE TABLE "catechesis"."roll_reminders" (
    "class_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "alerted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roll_reminders_pkey" PRIMARY KEY ("class_id","date")
);

-- CreateIndex
CREATE INDEX "sacrament_celebration_classes_class_id_idx" ON "catechesis"."sacrament_celebration_classes"("class_id");

-- CreateIndex
CREATE INDEX "sacrament_celebration_catechumens_catechumen_id_idx" ON "catechesis"."sacrament_celebration_catechumens"("catechumen_id");

-- CreateIndex
CREATE INDEX "sacrament_celebrations_catechetical_year_type_date_idx" ON "catechesis"."sacrament_celebrations"("catechetical_year", "type", "date");

-- AddForeignKey
ALTER TABLE "catechesis"."sacrament_celebration_classes" ADD CONSTRAINT "sacrament_celebration_classes_celebration_id_fkey" FOREIGN KEY ("celebration_id") REFERENCES "catechesis"."sacrament_celebrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."sacrament_celebration_classes" ADD CONSTRAINT "sacrament_celebration_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "catechesis"."classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."sacrament_celebration_catechumens" ADD CONSTRAINT "sacrament_celebration_catechumens_celebration_id_fkey" FOREIGN KEY ("celebration_id") REFERENCES "catechesis"."sacrament_celebrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."sacrament_celebration_catechumens" ADD CONSTRAINT "sacrament_celebration_catechumens_catechumen_id_fkey" FOREIGN KEY ("catechumen_id") REFERENCES "catechesis"."catechumens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catechesis"."roll_reminders" ADD CONSTRAINT "roll_reminders_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "catechesis"."classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
