-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "messaging";

-- CreateEnum
CREATE TYPE "messaging"."ConversationKind" AS ENUM ('DIRECT', 'COORDINATION');

-- CreateTable
CREATE TABLE "messaging"."conversations" (
    "id" UUID NOT NULL,
    "kind" "messaging"."ConversationKind" NOT NULL,
    "direct_key" TEXT,
    "subject_account_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_message_body" TEXT,
    "last_message_at" TIMESTAMPTZ(3),
    "last_message_sender_id" UUID,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."conversation_members" (
    "conversation_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(3),

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","account_id")
);

-- CreateTable
CREATE TABLE "messaging"."messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."push_subscriptions" (
    "id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "messaging"."conversations"("direct_key");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_subject_account_id_key" ON "messaging"."conversations"("subject_account_id");

-- CreateIndex
CREATE INDEX "conversations_kind_updated_at_idx" ON "messaging"."conversations"("kind", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "conversation_members_account_id_idx" ON "messaging"."conversation_members"("account_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messaging"."messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "notifications"."push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_account_id_idx" ON "notifications"."push_subscriptions"("account_id");

-- AddForeignKey
ALTER TABLE "messaging"."conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
