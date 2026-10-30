-- Centro da conta: escolhido no cadastro. Contas já existentes ficam no Centro Sede.

ALTER TABLE "identity"."accounts" ADD COLUMN "center_id" UUID;

UPDATE "identity"."accounts"
SET "center_id" = 'a1000000-0000-4000-8000-000000000001'
WHERE "center_id" IS NULL;

ALTER TABLE "identity"."accounts" ALTER COLUMN "center_id" SET NOT NULL;
