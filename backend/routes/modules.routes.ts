// backend/routes/modules.routes.ts
//
// Module/feature toggle system (spec §5) — real-backend counterpart to
// mocks/api.ts getModules/setModuleEnabled. Disabling a module hides its
// nav entry/tab and its AdminPanel section on the mobile side (see
// src/store/useModulesStore.ts) — this route just persists the flag.
//
// Integration:
//   · rbac.ts → requireRole, AuthedRequest, writeAuditLog
//   · schema.prisma → Module (key: ModuleKey)
//   · src/api/modules.ts on the mobile side — same request/response shapes

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";

const router = Router();

const MODULE_KEYS = [
  "EVENTS", "ATTENDANCE", "MESSAGING", "DOCUMENTS", "POINTS", "CALENDAR",
  "FEEDBACK", "COMMITTEES", "DUES", "TEAMS", "OFFICE_INVENTORY", "ATTENDANCE_RAFFLES",
] as const;

// Defaults mirror mocks/seed.ts moduleConfigs — kept in sync by hand since
// there's no shared package between mobile and backend (see
// src/types/index.ts ModuleKey for the mobile-side source of truth).
const DEFAULT_MODULES: { key: (typeof MODULE_KEYS)[number]; label: string; description: string; enabled: boolean; comingSoon: boolean }[] = [
  { key: "EVENTS", label: "Events", description: "Chapter events, RSVPs, and check-in", enabled: true, comingSoon: false },
  { key: "ATTENDANCE", label: "Attendance", description: "Check-in tracking and manual overrides", enabled: true, comingSoon: false },
  { key: "MESSAGING", label: "Messaging", description: "Channels and direct messages", enabled: true, comingSoon: false },
  { key: "DOCUMENTS", label: "Documents", description: "Chapter files, forms, and external links", enabled: true, comingSoon: false },
  { key: "POINTS", label: "Points & Leaderboard", description: "Individual and team point standings", enabled: true, comingSoon: false },
  { key: "CALENDAR", label: "Calendar", description: "Add-to-calendar and calendar sync for events", enabled: true, comingSoon: false },
  { key: "FEEDBACK", label: "Feedback & Bug Reports", description: "In-app bug reports and feature requests", enabled: true, comingSoon: false },
  { key: "COMMITTEES", label: "Committees", description: "Committee rosters, budgets, and reimbursements", enabled: true, comingSoon: false },
  { key: "DUES", label: "Dues", description: "Dues tracking and payments", enabled: true, comingSoon: false },
  { key: "TEAMS", label: "Teams", description: "Gamification teams and team leaderboard", enabled: true, comingSoon: false },
  { key: "OFFICE_INVENTORY", label: "Office Inventory", description: "Chapter property/equipment tracking", enabled: false, comingSoon: true },
  { key: "ATTENDANCE_RAFFLES", label: "Attendance Raffles", description: "Raffle prizes for event check-ins", enabled: false, comingSoon: true },
];

// ── GET /modules ────────────────────────────────────────────────────────────
// Open to any authenticated user — every client needs the full list to
// gate its own nav/UI. Auto-seeds the default module list on first read so
// a fresh database isn't stuck with an empty table (which would make
// isEnabled() fail open for everything — harmless, but ModulesScreen would
// have nothing to show a Super Admin to toggle).
router.get(
  "/modules",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const existing = await prisma.module.findMany();
    if (existing.length === 0) {
      await prisma.module.createMany({ data: DEFAULT_MODULES, skipDuplicates: true });
      return res.json({ modules: await prisma.module.findMany() });
    }
    res.json({ modules: existing });
  })
);

// ── PATCH /modules/:key — Super Admin only ─────────────────────────────────
const enabledSchema = z.object({ enabled: z.boolean() });

router.patch(
  "/modules/:key",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const key = req.params.key as (typeof MODULE_KEYS)[number];
    if (!MODULE_KEYS.includes(key)) {
      return res.status(400).json({ error: "Unknown module key" });
    }
    const parsed = enabledSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const defaults = DEFAULT_MODULES.find((m) => m.key === key)!;
    const updated = await prisma.module.upsert({
      where: { key },
      update: { enabled: parsed.data.enabled },
      create: { ...defaults, enabled: parsed.data.enabled },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: parsed.data.enabled ? "MODULE_ENABLE" : "MODULE_DISABLE",
      entityType: "Module",
      entityId: key,
      after: { enabled: parsed.data.enabled },
    });

    res.json({ module: updated });
  })
);

export default router;
