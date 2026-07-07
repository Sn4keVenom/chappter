// backend/routes/committees.routes.ts
//
// Integration points:
//   · rbac.ts → requireRole, requireCommitteeScope, AuthedRequest, writeAuditLog
//   · schema.prisma → Committee ←→ CommitteeMembership, Channel ←→ ChannelMembership
//
// Key decisions:
//   · Creating a committee atomically creates its COMMITTEE-type Channel and
//     adds the creator as the first ChannelMembership (ADMIN role).
//   · Adding a member to a committee also adds them to the committee's channel.
//   · Removing a member preserves their past messages (soft-relationship only).
//   · Chair of a committee can edit it; Exec+ can edit any committee.

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireRole, requireCommitteeScope, writeAuditLog } from "../middleware/rbac";

const router = Router();

const createCommitteeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateCommitteeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

const addMemberSchema = z.object({
  userId: z.string(),
  role: z.enum(["MEMBER", "CHAIR"]).default("MEMBER"),
});

// ── GET /committees ───────────────────────────────────────────────────────
router.get("/committees", async (req: AuthedRequest, res: Response) => {
  const committees = await prisma.committee.findMany({
    orderBy: { name: "asc" },
    include: {
      memberships: {
        include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      },
      channel: { select: { id: true } },
    },
  });

  res.json({
    committees: committees.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      channelId: c.channel?.id ?? null,
      memberCount: c.memberships.length,
      members: c.memberships.map((m) => ({
        userId: m.userId,
        role: m.role,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        avatarUrl: m.user.avatarUrl,
      })),
    })),
  });
});

// ── POST /committees — Exec+ ──────────────────────────────────────────────
router.post(
  "/committees",
  requireRole("EXEC"),
  async (req: AuthedRequest, res: Response) => {
    const parsed = createCommitteeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { name, description } = parsed.data;

    // Atomic: create committee + channel + creator's memberships
    const committee = await prisma.$transaction(async (tx) => {
      const created = await tx.committee.create({ data: { name, description } });

      const channel = await tx.channel.create({
        data: {
          name: `#${name.toLowerCase().replace(/\s+/g, "-")}`,
          type: "COMMITTEE",
          committeeId: created.id,
        },
      });

      await tx.committeeMembership.create({
        data: { committeeId: created.id, userId: req.user!.id, role: "CHAIR" },
      });

      await tx.channelMembership.create({
        data: { channelId: channel.id, userId: req.user!.id, role: "ADMIN" },
      });

      return { ...created, channelId: channel.id };
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "COMMITTEE_CREATE",
      entityType: "Committee",
      entityId: committee.id,
      after: committee,
    });

    res.status(201).json({ committee });
  }
);

// ── GET /committees/:id ───────────────────────────────────────────────────
router.get("/committees/:id", async (req: AuthedRequest, res: Response) => {
  const committee = await prisma.committee.findUnique({
    where: { id: req.params.id },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
      channel: { select: { id: true, name: true } },
      events: {
        where: { status: "PUBLISHED", startTime: { gte: new Date() } },
        orderBy: { startTime: "asc" },
        take: 5,
        select: { id: true, title: true, startTime: true, category: true },
      },
    },
  });

  if (!committee) return res.status(404).json({ error: "Committee not found" });

  // Map to the same shape returned by GET /committees so the mobile
  // Committee type is satisfied: members[] (not memberships[]), channelId at
  // the top level. The previous version returned the raw Prisma object and
  // CommitteeDetailScreen couldn't find committee.members or committee.channelId.
  res.json({
    committee: {
      id: committee.id,
      name: committee.name,
      description: committee.description,
      channelId: committee.channel?.id ?? null,
      channelName: committee.channel?.name ?? null,
      memberCount: committee.memberships.length,
      members: committee.memberships.map((m) => ({
        userId: m.userId,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
      })),
      upcomingEvents: committee.events,
    },
  });
});

// ── PATCH /committees/:id — Chair or Exec+ ────────────────────────────────
router.patch(
  "/committees/:id",
  requireCommitteeScope(async (req) => req.params.id),
  async (req: AuthedRequest, res: Response) => {
    const parsed = updateCommitteeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const before = await prisma.committee.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: "Committee not found" });

    const updated = await prisma.committee.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "COMMITTEE_UPDATE",
      entityType: "Committee",
      entityId: req.params.id,
      before,
      after: parsed.data,
    });

    res.json({ committee: updated });
  }
);

// ── POST /committees/:id/members ──────────────────────────────────────────
// Add or promote a member. Upserts both CommitteeMembership and ChannelMembership.
router.post(
  "/committees/:id/members",
  requireCommitteeScope(async (req) => req.params.id),
  async (req: AuthedRequest, res: Response) => {
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId, role } = parsed.data;
    const committeeId = req.params.id;

    const committee = await prisma.committee.findUnique({
      where: { id: committeeId },
      include: { channel: { select: { id: true } } },
    });
    if (!committee) return res.status(404).json({ error: "Committee not found" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const result = await prisma.$transaction(async (tx) => {
      const membership = await tx.committeeMembership.upsert({
        where: { committeeId_userId: { committeeId, userId } },
        update: { role },
        create: { committeeId, userId, role },
      });

      if (committee.channel) {
        await tx.channelMembership.upsert({
          where: { channelId_userId: { channelId: committee.channel.id, userId } },
          update: { role: role === "CHAIR" ? "ADMIN" : "MEMBER" },
          create: {
            channelId: committee.channel.id,
            userId,
            role: role === "CHAIR" ? "ADMIN" : "MEMBER",
          },
        });
      }

      return membership;
    });

    res.json({ membership: result });
  }
);

// ── DELETE /committees/:id/members/:userId ────────────────────────────────
router.delete(
  "/committees/:id/members/:userId",
  requireCommitteeScope(async (req) => req.params.id),
  async (req: AuthedRequest, res: Response) => {
    const { id: committeeId, userId } = req.params;

    const committee = await prisma.committee.findUnique({
      where: { id: committeeId },
      include: { channel: { select: { id: true } } },
    });
    if (!committee) return res.status(404).json({ error: "Committee not found" });

    const membership = await prisma.committeeMembership.findUnique({
      where: { committeeId_userId: { committeeId, userId } },
    });
    if (!membership) return res.status(404).json({ error: "Membership not found" });

    await prisma.$transaction(async (tx) => {
      await tx.committeeMembership.delete({
        where: { committeeId_userId: { committeeId, userId } },
      });

      // Remove channel access; messages are preserved (soft-relationship)
      if (committee.channel) {
        await tx.channelMembership.deleteMany({
          where: { channelId: committee.channel.id, userId },
        });
      }
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "COMMITTEE_MEMBER_REMOVE",
      entityType: "CommitteeMembership",
      entityId: membership.id,
      before: { committeeId, userId },
    });

    res.json({ removed: true });
  }
);

export default router;
