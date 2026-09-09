-- AlterTable
ALTER TABLE "PointsLedger" ADD COLUMN     "archivedInResetId" TEXT;

-- CreateTable
CREATE TABLE "PointsReset" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetById" TEXT NOT NULL,

    CONSTRAINT "PointsReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsLedger_semesterId_archivedInResetId_idx" ON "PointsLedger"("semesterId", "archivedInResetId");

-- CreateIndex
CREATE INDEX "PointsReset_semesterId_idx" ON "PointsReset"("semesterId");

-- AddForeignKey
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_archivedInResetId_fkey" FOREIGN KEY ("archivedInResetId") REFERENCES "PointsReset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsReset" ADD CONSTRAINT "PointsReset_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsReset" ADD CONSTRAINT "PointsReset_resetById_fkey" FOREIGN KEY ("resetById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
