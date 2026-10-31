-- Mudança de centro em dois passos: origem analisa, depois o destino aceita.

CREATE TYPE "catechesis"."CenterTransferStatus_new" AS ENUM (
  'ORIGIN_REVIEW',
  'DESTINATION_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

ALTER TABLE "catechesis"."center_transfer_requests"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "catechesis"."center_transfer_requests"
  ALTER COLUMN "status" TYPE "catechesis"."CenterTransferStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PENDING' THEN 'ORIGIN_REVIEW'
      ELSE "status"::text
    END::"catechesis"."CenterTransferStatus_new"
  );

DROP TYPE "catechesis"."CenterTransferStatus";
ALTER TYPE "catechesis"."CenterTransferStatus_new" RENAME TO "CenterTransferStatus";

ALTER TABLE "catechesis"."center_transfer_requests"
  ADD COLUMN "origin_reviewed_at" TIMESTAMPTZ(3),
  ADD COLUMN "origin_reviewed_by" UUID,
  ADD COLUMN "origin_note" TEXT;
