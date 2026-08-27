-- AlterTable
ALTER TABLE "ChapterJoinRequest" ADD COLUMN     "memberStatus" "MemberStatus",
ADD COLUMN     "roleNumber" INTEGER;

-- CreateTable
CREATE TABLE "ChapterRosterEntry" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "roleNumber" INTEGER NOT NULL,
    "status" "MemberStatus" NOT NULL,
    "claimedByUserId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterRosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChapterRosterEntry_claimedByUserId_key" ON "ChapterRosterEntry"("claimedByUserId");

-- CreateIndex
CREATE INDEX "ChapterRosterEntry_chapterId_firstName_idx" ON "ChapterRosterEntry"("chapterId", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterRosterEntry_chapterId_roleNumber_key" ON "ChapterRosterEntry"("chapterId", "roleNumber");

-- AddForeignKey
ALTER TABLE "ChapterRosterEntry" ADD CONSTRAINT "ChapterRosterEntry_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRosterEntry" ADD CONSTRAINT "ChapterRosterEntry_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRosterEntry" ADD CONSTRAINT "ChapterRosterEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ChapterMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
