-- Chapter/Membership account system migration.
--
-- This is a breaking schema change: role/office/status/pledgeClassLabel move
-- off "User" onto a new per-chapter "ChapterMembership" row, and "User"
-- gains a required "username". Both changes need existing rows backfilled
-- BEFORE the old columns are dropped / the new column is made NOT NULL, so
-- this migration interleaves DDL and data steps in a specific order:
--
--   1. Create every new table (Chapter, ChapterMembership, ChapterInvite,
--      ChapterInviteRedemption, ChapterJoinRequest, OfficePermission).
--   2. Add the new User columns as NULLABLE.
--   3. Backfill: one Chapter from the existing ChapterSettings singleton (if
--      any), one ChapterMembership per existing User copying their
--      role/office/status/pledgeClassLabel, a generated unique username per
--      User, and User.activeChapterId pointed at that chapter.
--   4. Only now tighten constraints (NOT NULL, UNIQUE) on the backfilled
--      columns, point ChapterSettings at the chapter, and drop the columns
--      that moved off User.
--   5. Add foreign keys and remaining indexes.
--
-- Safe to run against an empty database too (steps 3 backfill zero rows).

-- ── 1. New enum + tables ────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "letters" TEXT,
    "university" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "office" "ExecOffice",
    "status" "MemberStatus" NOT NULL DEFAULT 'PNM',
    "roleNumber" INTEGER,
    "pledgeClassLabel" TEXT,
    "major" TEXT,
    "graduationYear" INTEGER,
    "initiationDate" TIMESTAMP(3),
    "graduationDate" TIMESTAMP(3),
    "bigMembershipId" TEXT,
    "invitedById" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterInvite" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MemberStatus" NOT NULL DEFAULT 'PNM',
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterInviteRedemption" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterInviteRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterJoinRequest" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficePermission" (
    "id" TEXT NOT NULL,
    "office" "ExecOffice" NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficePermission_pkey" PRIMARY KEY ("id")
);

-- ── 2. New User/ChapterSettings columns, added nullable so existing rows
--       don't fail the ALTER before they're backfilled below ─────────────

ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "activeChapterId" TEXT;
ALTER TABLE "ChapterSettings" ADD COLUMN "chapterId" TEXT;

-- ── 3. Backfill ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_chapter_id TEXT;
  v_settings_count INTEGER;
BEGIN
  -- One Chapter row. If a ChapterSettings singleton already exists, carry
  -- its identity fields over; otherwise create a placeholder chapter (a
  -- fresh/empty database has no ChapterSettings row yet either).
  SELECT count(*) INTO v_settings_count FROM "ChapterSettings";

  IF v_settings_count > 0 THEN
    v_chapter_id := 'cm_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
    INSERT INTO "Chapter" ("id", "name", "letters", "university", "logoUrl", "createdAt", "updatedAt")
    SELECT v_chapter_id,
           COALESCE(NULLIF("chapterName", ''), 'Chapter'),
           NULLIF("chapterLetters", ''),
           NULLIF("university", ''),
           "logoUrl",
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP
    FROM "ChapterSettings"
    LIMIT 1;

    UPDATE "ChapterSettings" SET "chapterId" = v_chapter_id;
  ELSIF EXISTS (SELECT 1 FROM "User" LIMIT 1) THEN
    -- No settings row yet, but there are existing users — still need
    -- somewhere to attach their backfilled memberships.
    v_chapter_id := 'cm_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
    INSERT INTO "Chapter" ("id", "name", "createdAt", "updatedAt")
    VALUES (v_chapter_id, 'Chapter', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  END IF;

  -- Backfill one ChapterMembership per existing User, copying their
  -- role/office/status/pledgeClassLabel, only if we created a chapter above.
  IF v_chapter_id IS NOT NULL THEN
    INSERT INTO "ChapterMembership"
      ("id", "userId", "chapterId", "role", "office", "status", "pledgeClassLabel", "joinedAt", "createdAt", "updatedAt")
    SELECT
      'cm_' || substr(md5(random()::text || clock_timestamp()::text || u."id"), 1, 24),
      u."id",
      v_chapter_id,
      u."role",
      u."office",
      u."status",
      u."pledgeClassLabel",
      u."createdAt",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "User" u;

    UPDATE "User" SET "activeChapterId" = v_chapter_id;
  END IF;
END $$;

-- Every existing User needs a unique username before the column can become
-- NOT NULL UNIQUE — derive it from the email local-part, disambiguated with
-- a short slice of their own id (already unique) so no collision handling
-- loop is required.
UPDATE "User"
SET "username" = lower(regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9_]', '', 'g')) || '_' || substr("id", 1, 6)
WHERE "username" IS NULL;

-- ── 4. Tighten constraints now that every row has a value ───────────────

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "ChapterSettings" ALTER COLUMN "chapterId" SET NOT NULL;
ALTER TABLE "ChapterSettings" ALTER COLUMN "id" DROP DEFAULT;

-- DropIndex
DROP INDEX "User_role_idx";

-- DropIndex
DROP INDEX "User_status_idx";

-- AlterTable: drop the columns that moved to ChapterMembership
ALTER TABLE "User" DROP COLUMN "office",
DROP COLUMN "pledgeClassLabel",
DROP COLUMN "role",
DROP COLUMN "status";

-- AlterTable: drop the chapter-identity columns that moved to Chapter
ALTER TABLE "ChapterSettings" DROP COLUMN "chapterLetters",
DROP COLUMN "chapterName",
DROP COLUMN "logoUrl",
DROP COLUMN "university";

-- ── 5. Indexes + foreign keys ─────────────────────────────────────────────

-- CreateIndex
CREATE INDEX "Chapter_name_idx" ON "Chapter"("name");

-- CreateIndex
CREATE INDEX "ChapterMembership_chapterId_role_idx" ON "ChapterMembership"("chapterId", "role");

-- CreateIndex
CREATE INDEX "ChapterMembership_chapterId_status_idx" ON "ChapterMembership"("chapterId", "status");

-- CreateIndex
CREATE INDEX "ChapterMembership_bigMembershipId_idx" ON "ChapterMembership"("bigMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterMembership_chapterId_userId_key" ON "ChapterMembership"("chapterId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterMembership_chapterId_roleNumber_key" ON "ChapterMembership"("chapterId", "roleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterInvite_code_key" ON "ChapterInvite"("code");

-- CreateIndex
CREATE INDEX "ChapterInvite_chapterId_idx" ON "ChapterInvite"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterInviteRedemption_inviteId_userId_key" ON "ChapterInviteRedemption"("inviteId", "userId");

-- CreateIndex
CREATE INDEX "ChapterJoinRequest_chapterId_status_idx" ON "ChapterJoinRequest"("chapterId", "status");

-- CreateIndex
CREATE INDEX "ChapterJoinRequest_userId_idx" ON "ChapterJoinRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficePermission_office_permission_key" ON "OfficePermission"("office", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_activeChapterId_idx" ON "User"("activeChapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterSettings_chapterId_key" ON "ChapterSettings"("chapterId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeChapterId_fkey" FOREIGN KEY ("activeChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterMembership" ADD CONSTRAINT "ChapterMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterMembership" ADD CONSTRAINT "ChapterMembership_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterMembership" ADD CONSTRAINT "ChapterMembership_bigMembershipId_fkey" FOREIGN KEY ("bigMembershipId") REFERENCES "ChapterMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterMembership" ADD CONSTRAINT "ChapterMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "ChapterMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterInvite" ADD CONSTRAINT "ChapterInvite_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterInvite" ADD CONSTRAINT "ChapterInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ChapterMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterInviteRedemption" ADD CONSTRAINT "ChapterInviteRedemption_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ChapterInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterInviteRedemption" ADD CONSTRAINT "ChapterInviteRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterJoinRequest" ADD CONSTRAINT "ChapterJoinRequest_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterJoinRequest" ADD CONSTRAINT "ChapterJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterJoinRequest" ADD CONSTRAINT "ChapterJoinRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "ChapterMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSettings" ADD CONSTRAINT "ChapterSettings_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
