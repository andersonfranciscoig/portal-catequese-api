-- CreateEnum
CREATE TYPE "catechesis"."SacramentType" AS ENUM ('BAPTISM', 'FIRST_COMMUNION', 'CONFIRMATION');

-- CreateEnum
CREATE TYPE "catechesis"."SacramentRequirement" AS ENUM ('BIRTH_CERTIFICATE', 'BAPTISM_CERTIFICATE', 'RECONCILIATION', 'GODPARENT', 'PARENTS_MEETING');

-- CreateTable
CREATE TABLE "catechesis"."sacrament_celebrations" (
    "catechetical_year" TEXT NOT NULL,
    "type" "catechesis"."SacramentType" NOT NULL,
    "date" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "sacrament_celebrations_pkey" PRIMARY KEY ("catechetical_year","type")
);

-- CreateTable
CREATE TABLE "catechesis"."sacrament_requirement_checks" (
    "catechumen_id" UUID NOT NULL,
    "sacrament" "catechesis"."SacramentType" NOT NULL,
    "requirement" "catechesis"."SacramentRequirement" NOT NULL,
    "met" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "sacrament_requirement_checks_pkey" PRIMARY KEY ("catechumen_id","sacrament","requirement")
);

-- AddForeignKey
ALTER TABLE "catechesis"."sacrament_requirement_checks" ADD CONSTRAINT "sacrament_requirement_checks_catechumen_id_fkey" FOREIGN KEY ("catechumen_id") REFERENCES "catechesis"."catechumens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

