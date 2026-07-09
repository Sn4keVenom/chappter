// backend/routes/documents.routes.ts
//
// Documents & external links (spec §8) — real-backend counterpart to
// mocks/api.ts listDocuments/uploadDocument/deleteDocument/
// listExternalLinks/createExternalLink/deleteExternalLink.
//
// Upload is a placeholder (no real object storage) — matches
// schema.prisma Document.fileLabel doc comment. See docs/DEMO_MODE.md /
// the production-readiness audit report for the file-storage gap.
//
// Authorization mirrors the mock's default permission presets
// (documents.view = everyone, documents.upload/delete = Exec+) — see
// docs/PERMISSIONS.md for why this is a flat role check here rather than
// reading the RolePermission table directly.
//
// Integration:
//   · rbac.ts → requireRole, AuthedRequest, writeAuditLog
//   · schema.prisma → Document, ExternalLink
//   · src/api/documents.ts on the mobile side — same request/response shapes

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";

const router = Router();

const CATEGORIES = [
  "CONSTITUTION", "BYLAWS", "MEETING_MINUTES", "RECRUITMENT", "FORMS", "OFFICER_RESOURCES", "OTHER",
] as const;

// ── GET /documents ──────────────────────────────────────────────────────────
router.get(
  "/documents",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { category } = req.query;
    const documents = await prisma.document.findMany({
      where: category ? { category: String(category) as any } : {},
      orderBy: { uploadedAt: "desc" },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json({ documents });
  })
);

// ── POST /documents — Exec+ ─────────────────────────────────────────────────
const uploadSchema = z.object({
  category: z.enum(CATEGORIES),
  name: z.string().min(1).max(200),
  fileLabel: z.string().min(1).max(200),
});

router.post(
  "/documents",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const document = await prisma.document.create({
      data: { ...parsed.data, uploadedById: req.user!.id },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DOCUMENT_UPLOAD",
      entityType: "Document",
      entityId: document.id,
      after: { category: document.category, name: document.name },
    });

    res.status(201).json({ document });
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
