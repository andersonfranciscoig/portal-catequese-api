-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notifications";

-- CreateTable
CREATE TABLE "notifications"."notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"."notifications"("recipient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"."notifications"("recipient_id", "read_at");
