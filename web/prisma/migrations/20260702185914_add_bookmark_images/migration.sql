-- AlterTable
ALTER TABLE "Bookmark" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
