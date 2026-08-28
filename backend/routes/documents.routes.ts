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
// reading the RolePermission table directly. Two categories narrow "everyone"
// further, per-category rather than per-route (see canViewCategory below):
//   · BYLAWS            — Marshal (the office) or Super Admin only
//   · OFFICER_RESOURCES — Exec role or Super Admin only (no PNM/Member/Alumni)
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

/** Whether this viewer can see documents in `category`. Super Admin always
 * can (matches the rest of the app's "SUPER_ADMIN bypasses everything"
 * rule — see docs/PERMISSIONS.md). Every other category is unrestricted;
 * only these two are narrowed at all. */
function canViewCategory(user: AuthedRequest["user"], category: string): boolean {
  if (user?.role === "SUPER_ADMIN") return true;
  if (category === "BYLAWS") return user?.office === "MARSHAL";
  if (category === "OFFICER_RESOURCES") return user?.role === "EXEC";
  return true;
}

// ── GET /documents ──────────────────────────────────────────────────────────
router.get(
  "/documents",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { category } = req.query;

    // A request scoped to one restricted category the viewer can't see gets
    // a clear 403, not a silently empty list — the latter is indistinguishable
    // from "this category is genuinely empty" and DocumentCategoryPage.tsx
    // would render a confusing "No documents yet" instead of an error.
    if (category && !canViewCategory(req.user, String(category))) {
      return res.status(403).json({ error: "Not permitted" });
    }

    const documents = await prisma.document.findMany({
      where: category ? { category: String(category) as any } : {},
      orderBy: { uploadedAt: "desc" },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
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
