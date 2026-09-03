-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "checkInCode" TEXT,
ADD COLUMN     "checkInCodeExpiresAt" TIMESTAMP(3);
