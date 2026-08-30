-- AlterTable
ALTER TABLE "ChapterInvite" ADD COLUMN     "label" TEXT,
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "regeneratedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EventDelegate" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "EventDelegate_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "EventDelegate_userId_idx" ON "EventDelegate"("userId");

-- AddForeignKey
ALTER TABLE "EventDelegate" ADD CONSTRAINT "EventDelegate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDelegate" ADD CONSTRAINT "EventDelegate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
