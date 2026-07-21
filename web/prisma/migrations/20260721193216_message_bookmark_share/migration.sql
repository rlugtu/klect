-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'BOOKMARK');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "sharedBookmark" JSONB,
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT';
