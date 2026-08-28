-- CreateEnum
CREATE TYPE "DuesPlan" AS ENUM ('FULL', 'MONTHLY');

-- AlterTable
ALTER TABLE "DuesRecord" ADD COLUMN     "plan" "DuesPlan";
