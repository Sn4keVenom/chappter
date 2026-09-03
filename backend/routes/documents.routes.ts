// backend/routes/documents.routes.ts
//
// Documents, folders, and external links (spec §8) — real-backend
// counterpart to mocks/api.ts listDocuments/uploadDocument/deleteDocument/
// listExternalLinks/createExternalLink/deleteExternalLink.
//
// Folders (DocumentFolder) are the chapter-managed, addable/removable
// buckets — "Document categories should be able to be added or removed" —
// replacing what used to be a fixed 7-value enum. That enum (Document.category)
// still exists and is still readable on old rows for backward compatibility,
// but every new document uses folderId instead; see schema.prisma's doc
// comment on DocumentFolder for why this coexists rather than replacing the
// column outright. The two legacy-only view restrictions (BYLAWS, OFFICER_
// RESOURCES) stay keyed on that old enum — a chapter-created folder has no
// per-folder restriction system (yet); every folder's documents are visible
// to anyone with documents.view.
//
// Real file storage — lib/uploads.ts, local disk under a Docker volume, not
// object storage (this is a single-box self-hosted deployment). Files are
// never served as static assets: GET /documents/:id/file re-checks the same
// view permission on every request, the same as the JSON list endpoint.
//
// Integration:
//   · rbac.ts → requireRole, AuthedRequest, writeAuditLog
//   · schema.prisma → Document, DocumentFolder, ExternalLink
//   · lib/uploads.ts → uploadSingleFile, storedFileFrom, uploadedFilePath, deleteUploadedFile
//   · src/api/documents.ts on the client side — same request/response shapes

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";
import { uploadSingleFile, storedFileFrom, uploadedFilePath, deleteUploadedFile } from "../lib/uploads";

const router = Router();

const LEGACY_CATEGORIES = [
  "CONSTITUTION", "BYLAWS", "MEETING_MINUTES", "RECRUITMENT", "FORMS", "OFFICER_RESOURCES", "OTHER",
] as const;

/** Whether this viewer can see a document in legacy `category` (null for a
 * folder-only document — unrestricted). Super Admin always can (matches the
 * rest of the app's "SUPER_ADMIN bypasses everything" rule). */
function canViewCategory(user: AuthedRequest["user"], category: string | null): boolean {
  if (!category) return true;
  if (user?.role === "SUPER_ADMIN") return true;
  if (category === "BYLAWS") return user?.office === "MARSHAL";
  if (category === "OFFICER_RESOURCES") return user?.role === "EXEC";
  return true;
}

// ── Folders ──────────────────────────────────────────────────────────────

router.get(
  "/document-folders",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const folders = await prisma.documentFolder.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: { _count: { select: { documents: true } } },
    });
    res.json({
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        order: f.order,
        documentCount: f._count.documents,
      })),
    });
  })
);

const folderSchema = z.object({ name: z.string().min(1).max(80) });

router.post(
  "/document-folders",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = folderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const maxOrder = await prisma.documentFolder.aggregate({ _max: { order: true } });

    let folder;
    try {
      folder = await prisma.documentFolder.create({
        data: { name: parsed.data.name.trim(), order: (maxOrder._max.order ?? -1) + 1 },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return res.status(409).json({ error: `A folder named "${parsed.data.name.trim()}" already exists.` });
      }
      throw err;
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DOCUMENT_FOLDER_CREATE",
      entityType: "DocumentFolder",
      entityId: folder.id,
      after: { name: folder.name },
    });

    res.status(201).json({ folder: { id: folder.id, name: folder.name, order: folder.order, documentCount: 0 } });
  })
);

router.patch(
  "/document-folders/:id",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = folderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const before = await prisma.documentFolder.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: "Folder not found" });

    let updated;
    try {
      updated = await prisma.documentFolder.update({
        where: { id: req.params.id },
        data: { name: parsed.data.name.trim() },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return res.status(409).json({ error: `A folder named "${parsed.data.name.trim()}" already exists.` });
      }
      throw err;
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DOCUMENT_FOLDER_RENAME",
      entityType: "DocumentFolder",
      entityId: updated.id,
      before: { name: before.name },
      after: { name: updated.name },
    });

    res.json({ folder: { id: updated.id, name: updated.name, order: updated.order } });
  })
);

// Removing a folder does NOT delete the documents inside it — they fall
// back to "no folder" (schema.prisma: onDelete SetNull), same as removing a
// team doesn't delete its members. A chapter reorganizing its folders
// shouldn't risk losing files as a side effect.
router.delete(
  "/document-folders/:id",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const folder = await prisma.documentFolder.findUnique({ where: { id: req.params.id } });
    if (!folder) return res.status(404).json({ error: "Folder not found" });

    await prisma.documentFolder.delete({ where: { id: req.params.id } });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DOCUMENT_FOLDER_DELETE",
      entityType: "DocumentFolder",
      entityId: folder.id,
      before: { name: folder.name },
    });

    res.json({ deleted: true });
  })
);

// ── GET /documents ──────────────────────────────────────────────────────────
router.get(
  "/documents",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { category, folderId } = req.query;

    // A request scoped to one restricted legacy category the viewer can't
    // see gets a clear 403, not a silently empty list — the latter is
    // indistinguishable from "this category is genuinely empty" and
    // DocumentCategoryPage.tsx would render a confusing "No documents yet"
    // instead of an error. Folders have no such restriction to check.
    if (category && !canViewCategory(req.user, String(category))) {
      return res.status(403).json({ error: "Not permitted" });
    }

    const documents = await prisma.document.findMany({
      where: {
        ...(category ? { category: String(category) as any } : {}),
        ...(folderId ? { folderId: String(folderId) } : {}),
      },
      orderBy: { uploadedAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        folder: { select: { id: true, name: true } },
      },
    });

    // The unscoped "all documents" fetch (DocumentsPage.tsx's index, which
    // counts per category client-side) can't 403 — legitimately-viewable
    // categories still need to come back. Restricted docs are filtered out
    // instead, which reads as "0 files" for that category rather than an
    // error; the category page itself still 403s if someone navigates to it
    // directly, per the check above.
    const visible = documents.filter((doc) => canViewCategory(req.user, doc.category));
    res.json({ documents: visible });
  })
);

// ── POST /documents — Exec+, multipart with a "file" field ─────────────────
// folderId is the primary path; category (the legacy fixed set) is still
// accepted for anything that still sends it, but is otherwise optional now.
router.post(
  "/documents",
  requireRole("EXEC"),
  uploadSingleFile,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "Attach a file to upload." });

    const uploadSchema = z.object({
      name: z.string().min(1).max(200),
      folderId: z.string().min(1).optional(),
      category: z.enum(LEGACY_CATEGORIES).optional(),
    });
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      await deleteUploadedFile(req.file.filename); // don't leave an orphaned file for a request that fails validation
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    if (!parsed.data.folderId && !parsed.data.category) {
      await deleteUploadedFile(req.file.filename);
      return res.status(400).json({ error: "Choose a folder." });
    }
    if (parsed.data.folderId) {
      const folder = await prisma.documentFolder.findUnique({ where: { id: parsed.data.folderId } });
      if (!folder) {
        await deleteUploadedFile(req.file.filename);
        return res.status(404).json({ error: "Folder not found" });
      }
    }

    const stored = storedFileFrom(req.file);
    const document = await prisma.document.create({
      data: {
        name: parsed.data.name,
        folderId: parsed.data.folderId,
        category: parsed.data.category,
        fileLabel: stored.originalName,
        storedFileName: stored.storedName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedById: req.user!.id,
      },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        folder: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DOCUMENT_UPLOAD",
      entityType: "Document",
      entityId: document.id,
      after: { name: document.name, folderId: document.folderId, category: document.category },
    });

    res.status(201).json({ document });
  })
);

// ── GET /documents/:id/file — download/view the actual file ────────────────
router.get(
  "/documents/:id/file",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (!canViewCategory(req.user, doc.category)) return res.status(403).json({ error: "Not permitted" });
    if (!doc.storedFileName) return res.status(404).json({ error: "This document has no file attached." });

    res.download(uploadedFilePath(doc.storedFileName), doc.fileLabel, (err) => {
      // res.download already sent headers/started the response by the time
      // an error would fire here (e.g. the file went missing from disk) —
      // asyncHandler's catch can't help at that point, so this is the one
      // place that has to handle it directly.
      if (err && !res.headersSent) res.status(404).json({ error: "File not found on disk." });
    });
  })
);

// ── DELETE /documents/:id — Exec+ ───────────────────────────────────────────
router.delete(
  "/documents/:id",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: "Document not found" });

    await prisma.document.delete({ where: { id: req.params.id } });
    await deleteUploadedFile(doc.storedFileName);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DOCUMENT_DELETE",
      entityType: "Document",
      entityId: doc.id,
      before: { category: doc.category, name: doc.name },
    });

    res.json({ deleted: true });
  })
);

// ── GET /links ───────────────────────────────────────────────────────────────
router.get(
  "/links",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const links = await prisma.externalLink.findMany({ orderBy: { label: "asc" } });
    res.json({ links });
  })
);

// ── POST /links — Exec+ ─────────────────────────────────────────────────────
const linkSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().url(),
  category: z.string().max(50).optional(),
});

router.post(
  "/links",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const link = await prisma.externalLink.create({ data: parsed.data });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "EXTERNAL_LINK_CREATE",
      entityType: "ExternalLink",
      entityId: link.id,
      after: parsed.data,
    });

    res.status(201).json({ link });
  })
);

// ── DELETE /links/:id — Exec+ ────────────────────────────────────────────────
router.delete(
  "/links/:id",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const link = await prisma.externalLink.findUnique({ where: { id: req.params.id } });
    if (!link) return res.status(404).json({ error: "Link not found" });

    await prisma.externalLink.delete({ where: { id: req.params.id } });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "EXTERNAL_LINK_DELETE",
      entityType: "ExternalLink",
      entityId: link.id,
      before: { label: link.label, url: link.url },
    });

    res.json({ deleted: true });
  })
);

export default router;
