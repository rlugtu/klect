-- AlterTable
ALTER TABLE "User" DROP COLUMN "displayName",
ADD COLUMN     "handle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
