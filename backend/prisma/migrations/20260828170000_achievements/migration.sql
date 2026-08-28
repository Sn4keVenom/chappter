-- CreateEnum
CREATE TYPE "AchievementMetric" AS ENUM ('ATTENDANCE_COUNT', 'TOTAL_POINTS', 'BONUS_COUNT', 'COMMITTEE_COUNT', 'RANK_AT_MOST', 'NEVER_LATE_AFTER', 'DUES_SETTLED');

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "metric" "AchievementMetric" NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Achievement_chapterId_sortOrder_idx" ON "Achievement"("chapterId", "sortOrder");
-- CreateIndex
CREATE UNIQUE INDEX "Achievement_chapterId_key_key" ON "Achievement"("chapterId", "key");

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
