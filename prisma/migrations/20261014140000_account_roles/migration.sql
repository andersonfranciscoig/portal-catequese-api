-- Uma conta passa a poder ter vários papéis (ex.: encarregado e catequista).
-- Converte o papel único de cada conta em lista, sem perder dados.

-- AlterTable
ALTER TABLE "identity"."accounts" ADD COLUMN "roles" "identity"."AccountRole"[];

UPDATE "identity"."accounts" SET "roles" = ARRAY["role"];

ALTER TABLE "identity"."accounts" DROP COLUMN "role";
