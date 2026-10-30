-- O valor novo do enum não pode ser usado na mesma transação em que é criado.
-- Esta migração só acrescenta GENERAL_COORDINATION. O backfill das contas fica na seguinte.

-- AlterEnum
ALTER TYPE "identity"."Permission" ADD VALUE 'GENERAL_COORDINATION';
