-- Adds soft-delete support for User, driven by the Clerk `user.deleted`
-- webhook (see backend/routes/webhook.routes.ts). NULL = active account;
-- non-null = the Clerk account behind it was deleted, and authMiddleware
-- treats the row as if it didn't exist. A real column delete would cascade
-- through ChapterMembership and orphan/cascade-delete history (Attendance,
-- Message, AuditLog, etc. that should survive as a record even after the
-- person's login is gone) — soft delete keeps all of that intact.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
