-- Contas que já tinham coordenação passam a coordenação geral da paróquia.
-- Não duplica a flag. Contas só com SUPER_ADMIN não precisam dela.

UPDATE "identity"."accounts"
SET "permissions" = "permissions" || ARRAY['GENERAL_COORDINATION']::"identity"."Permission"[]
WHERE 'COORDINATION' = ANY("permissions")
  AND NOT ('GENERAL_COORDINATION' = ANY("permissions"));
