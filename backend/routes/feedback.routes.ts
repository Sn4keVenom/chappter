// backend/routes/feedback.routes.ts
//
// In-app feedback & bug reports (spec §9) — real-backend counterpart to
// mocks/api.ts submitFeedback/listFeedback/updateFeedbackStatus.
// Submission is open to every authenticated user (no permission gate);
// viewing/managing the queue mirrors the mock's default presets
// (feedback.view/feedback.manage = Exec+).
//
// Integration:
//   · rbac.ts → requireRole, AuthedRequest, writeAuditLog
//   · schema.prisma → FeedbackReport
//   · src/api/feedback.ts on the mobile side — same request/response shapes

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";

const router = Router();

// ── POST /feedback — any authenticated user ─────────────────────────────────
const submitSchema = z.object({
  type: z.enum(["BUG", "FEATURE_REQUEST", "GENERAL"]),
  message: z.string().min(1).max(2000),
  appVersion: z.string().max(20),
  platform: z.string().max(20),
});

router.post(
  "/feedback",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const report = await prisma.feedbackReport.create({
      data: { ...parsed.data, submittedById: req.user!.id },
      include: { submittedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.status(201).json({ report });
  })
);

// ── GET /feedback — Exec+ ───────────────────────────────────────────────────
router.get(
  "/feedback",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { type, status } = req.query;
    const reports = await prisma.feedbackReport.findMany({
      where: {
        ...(type ? { type: String(type) as any } : {}),
        ...(status ? { status: String(status) as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { submittedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json({ reports });
  })
);

// ── PATCH /feedback/:id — Exec+ ─────────────────────────────────────────────
const statusSchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]),
});

router.patch(
  "/feedback/:id",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.feedbackReport.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Feedback report not found" });

    const report = await prisma.feedbackReport.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status },
      include: { submittedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "FEEDBACK_STATUS_UPDATE",
      entityType: "FeedbackReport",
      entityId: report.id,
      before: { status: existing.status },
      after: { status: report.status },
    });

    res.json({ report });
  })
);

export default router;
