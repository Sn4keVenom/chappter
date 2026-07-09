-- Fills a gap in the committed migration history discovered while testing
-- against a real, from-scratch Postgres database during release hardening:
-- the committed "init" migration (20260708014740) is a snapshot from
-- BEFORE the roles/permissions/modules/chapter-settings/documents/feedback
-- system was added (schema.prisma at commit 3b045e2), while the later
-- "chapter_membership_system" migration (20260709133044) assumes that
-- entire feature set already exists (it was diffed against schema.prisma
-- at commit 006eee3). Nothing bridged the two, so `prisma migrate deploy`
-- against a genuinely empty database has never actually worked. This
-- migration is that bridge — the diff from 3b045e2's schema to 006eee3's
-- schema, generated with `prisma migrate diff` against a real database and
-- reviewed by hand. Existing committed migrations are left untouched.
--
-- UserRole/MemberStatus enum values are renamed below (OFFICER dropped,
-- PNM/ALUMNI added; SUSPENDED/PLEDGE dropped, PNM/INACTIVE added). No real
-- database has ever run the OLD "init" migration in production (this
-- project has no live deployment yet — see docs/DEMO_MODE.md), so there is
-- no data to lose in practice, but the two enum-swap USING clauses below
-- map any legacy OFFICER/SUSPENDED/PLEDGE value to its nearest new
-- equivalent (mapped inline during the type cast itself, since a value
-- only the *new* enum has — e.g. 'INACTIVE' — can't be written into the
-- column while it's still the *old* enum type) rather than just failing
-- outright if this ever runs against a database that has legacy rows.

-- CreateEnum
CREATE TYPE "ExecOffice" AS ENUM ('REGENT', 'VICE_REGENT', 'TREASURER', 'SCRIBE', 'MARSHAL', 'CORRESPONDING_SECRETARY', 'NEW_MEMBER_EDUCATOR');

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('EVENTS', 'ATTENDANCE', 'MESSAGING', 'DOCUMENTS', 'POINTS', 'CALENDAR', 'FEEDBACK', 'COMMITTEES', 'DUES', 'TEAMS', 'OFFICE_INVENTORY', 'ATTENDANCE_RAFFLES');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CONSTITUTION', 'BYLAWS', 'MEETING_MINUTES', 'RECRUITMENT', 'FORMS', 'OFFICER_RESOURCES', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'FEATURE_REQUEST', 'GENERAL');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'EXEC', 'MEMBER', 'PNM', 'ALUMNI');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  (CASE "role"::text WHEN 'OFFICER' THEN 'EXEC' ELSE "role"::text END)::"UserRole_new"
);
-- NOTE: no "ALTER TABLE RolePermission ALTER COLUMN role TYPE ..." here —
-- unlike User, RolePermission doesn't exist yet at this point in the
-- migration (it's created fresh further down, in this same file, using
-- the "UserRole" name which by then refers to the renamed/final enum).
-- `prisma migrate diff` emitted an ALTER for it anyway (a table it was
-- about to CREATE later in the same script) — that statement would fail
-- outright since the table doesn't exist yet; removed by hand.
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MemberStatus_new" AS ENUM ('ACTIVE', 'PNM', 'ALUMNI', 'INACTIVE');
ALTER TABLE "User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "MemberStatus_new" USING (
  (CASE "status"::text
     WHEN 'SUSPENDED' THEN 'INACTIVE'
     WHEN 'PLEDGE' THEN 'PNM'
     ELSE "status"::text
   END)::"MemberStatus_new"
);
ALTER TYPE "MemberStatus" RENAME TO "MemberStatus_old";
ALTER TYPE "MemberStatus_new" RENAME TO "MemberStatus";
DROP TYPE "MemberStatus_old";
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PYLI';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "office" "ExecOffice";

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "key" "ModuleKey" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "comingSoon" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChapterSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "chapterName" TEXT NOT NULL,
    "chapterLetters" TEXT NOT NULL,
    "university" TEXT NOT NULL,
    "logoUrl" TEXT,
    "currentSemesterLabel" TEXT NOT NULL,
    "semesterStartDate" TIMESTAMP(3) NOT NULL,
    "semesterEndDate" TIMESTAMP(3) NOT NULL,
    "defaultDuesAmount" DECIMAL(10,2) NOT NULL,
    "defaultDuesPlan" TEXT NOT NULL DEFAULT 'FULL',
    "attendanceLateThresholdMinutes" INTEGER NOT NULL DEFAULT 15,
    "defaultEventPointValue" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "fileLabel" TEXT NOT NULL,
    "sizeLabel" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalLink" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "ExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackReport" (
    "id" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "message" TEXT NOT NULL,
    "submittedById" TEXT,
    "appVersion" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_permission_key" ON "RolePermission"("role", "permission");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE INDEX "FeedbackReport_status_idx" ON "FeedbackReport"("status");

-- CreateIndex
CREATE INDEX "FeedbackReport_type_idx" ON "FeedbackReport"("type");

-- CreateIndex
CREATE INDEX "Event_status_startTime_idx" ON "Event"("status", "startTime");

-- CreateIndex
CREATE INDEX "DuesRecord_semesterId_idx" ON "DuesRecord"("semesterId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
