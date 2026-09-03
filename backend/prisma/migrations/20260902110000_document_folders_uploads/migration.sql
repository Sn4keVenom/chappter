-- CreateTable
CREATE TABLE "DocumentFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFolder_name_key" ON "DocumentFolder"("name");

-- AlterTable: category becomes optional (a new upload only needs a
-- folderId), plus the new file-storage and folder-link columns.
ALTER TABLE "Document" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "Document" ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "storedFileName" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "sizeBytes" INTEGER;

-- CreateIndex
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: reimbursement receipt file storage
ALTER TABLE "Expense" ADD COLUMN     "receiptStoredFileName" TEXT,
ADD COLUMN     "receiptMimeType" TEXT;

-- Seed a DocumentFolder row for each of the old fixed categories, with
-- fixed/readable ids (not cuid — nothing requires that format at the DB
-- level, and it makes the backfill below simple to read). Every existing
-- chapter's documents end up with an equivalent, renameable/removable
-- folder instead of losing their grouping.
INSERT INTO "DocumentFolder" ("id", "name", "order") VALUES
    ('folder_constitution', 'Constitution', 0),
    ('folder_bylaws', 'Bylaws', 1),
    ('folder_meeting_minutes', 'Meeting Minutes', 2),
    ('folder_recruitment', 'Recruitment', 3),
    ('folder_forms', 'Forms', 4),
    ('folder_officer_resources', 'Officer Resources', 5),
    ('folder_other', 'Other', 6);

-- Backfill: every existing Document row gets the matching new folder, so
-- nothing already uploaded loses its grouping. Purely additive — the old
-- `category` column is untouched (still readable, just no longer required
-- going forward), so this can't lose data even if a value here somehow
-- didn't match.
UPDATE "Document" SET "folderId" = 'folder_constitution' WHERE "category" = 'CONSTITUTION';
UPDATE "Document" SET "folderId" = 'folder_bylaws' WHERE "category" = 'BYLAWS';
UPDATE "Document" SET "folderId" = 'folder_meeting_minutes' WHERE "category" = 'MEETING_MINUTES';
UPDATE "Document" SET "folderId" = 'folder_recruitment' WHERE "category" = 'RECRUITMENT';
UPDATE "Document" SET "folderId" = 'folder_forms' WHERE "category" = 'FORMS';
UPDATE "Document" SET "folderId" = 'folder_officer_resources' WHERE "category" = 'OFFICER_RESOURCES';
UPDATE "Document" SET "folderId" = 'folder_other' WHERE "category" = 'OTHER';
