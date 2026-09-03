-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "brotherOfWeekUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_brotherOfWeekUserId_fkey" FOREIGN KEY ("brotherOfWeekUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
