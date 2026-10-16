-- CreateEnum
CREATE TYPE "catechesis"."AnnouncementAudience" AS ENUM ('ALL', 'GUARDIANS', 'CATECHUMENS', 'CATECHISTS');

-- CreateTable
CREATE TABLE "catechesis"."announcements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "catechesis"."AnnouncementAudience" NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "author_name" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catechesis"."announcement_reads" (
    "announcement_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id","account_id")
);

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "catechesis"."announcements"("published_at" DESC);

-- AddForeignKey
ALTER TABLE "catechesis"."announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "catechesis"."announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
