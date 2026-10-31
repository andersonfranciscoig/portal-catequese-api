-- Pedidos de mudança de centro na mesma paróquia.
-- A matrícula e a confirmação ficam no centro onde foram feitas.

CREATE TYPE "catechesis"."CenterTransferKind" AS ENUM ('CATECHUMEN', 'CATECHIST');
CREATE TYPE "catechesis"."CenterTransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "catechesis"."center_transfer_requests" (
    "id" UUID NOT NULL,
    "kind" "catechesis"."CenterTransferKind" NOT NULL,
    "status" "catechesis"."CenterTransferStatus" NOT NULL,
    "requested_by" UUID NOT NULL,
    "from_center_id" UUID NOT NULL,
    "to_center_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "catechumen_id" UUID,
    "enrollment_id" UUID,
    "from_class_id" UUID,
    "from_level" "catechesis"."CatechesisLevel",
    "to_class_id" UUID,
    "catechist_account_id" UUID,
    "catechist_role" "catechesis"."ClassCatechistRole",
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" UUID,
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "center_transfer_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "center_transfer_requests_status_to_center_id_idx"
  ON "catechesis"."center_transfer_requests"("status", "to_center_id");
CREATE INDEX "center_transfer_requests_status_from_center_id_idx"
  ON "catechesis"."center_transfer_requests"("status", "from_center_id");
CREATE INDEX "center_transfer_requests_requested_by_idx"
  ON "catechesis"."center_transfer_requests"("requested_by");
CREATE INDEX "center_transfer_requests_catechumen_id_idx"
  ON "catechesis"."center_transfer_requests"("catechumen_id");
CREATE INDEX "center_transfer_requests_catechist_account_id_idx"
  ON "catechesis"."center_transfer_requests"("catechist_account_id");

ALTER TABLE "catechesis"."center_transfer_requests"
  ADD CONSTRAINT "center_transfer_requests_from_center_id_fkey"
  FOREIGN KEY ("from_center_id") REFERENCES "catechesis"."centers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catechesis"."center_transfer_requests"
  ADD CONSTRAINT "center_transfer_requests_to_center_id_fkey"
  FOREIGN KEY ("to_center_id") REFERENCES "catechesis"."centers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
