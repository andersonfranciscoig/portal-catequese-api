-- Turmas especiais (adultos, bebés) e batismo com comunhão no mesmo dia.

CREATE TYPE "catechesis"."ClassKind" AS ENUM ('REGULAR', 'SPECIAL');
CREATE TYPE "catechesis"."ClassAudience" AS ENUM ('CHILD', 'ADULT');

ALTER TABLE "catechesis"."classes"
  ADD COLUMN "kind" "catechesis"."ClassKind" NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN "sacrament" "catechesis"."SacramentType",
  ADD COLUMN "audience" "catechesis"."ClassAudience";

DROP INDEX "catechesis"."classes_catechetical_year_level_section_center_id_key";
CREATE UNIQUE INDEX "classes_catechetical_year_level_section_center_id_kind_key"
  ON "catechesis"."classes"("catechetical_year", "level", "section", "center_id", "kind");

ALTER TABLE "catechesis"."sacrament_celebrations"
  ADD COLUMN "with_communion" BOOLEAN NOT NULL DEFAULT false;
