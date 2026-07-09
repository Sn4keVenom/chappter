// backend/routes/messages.routes.ts
//
// Integration points:
//   · rbac.ts → requireRole, AuthedRequest, writeAuditLog
//   · schema.prisma → Channel (type: GENERAL|COMMITTEE|OFFICERS|DM),
//     ChannelMembership, Message (soft-delete via deletedAt)
//
// Access model (mirrors product spec §4.3):
//   GENERAL   — all members read; Exec+ post (announcement channel)
//   OFFICERS  — Exec+ read and post (the OFFICER role tier was removed —
//               see permissions/permissions.ts on the mobile side, which
//               additionally grants this to an ACTIVE-status committee
//               chair via hasAnyManagementAccess; that scoped nuance isn't
//               replicated here yet, see docs/DEMO_MODE.md)
//   COMMITTEE — ChannelMembership members OR Exec+ bypass
//   DM        — ChannelMembership members only
//
// Soft-delete: Message.deletedAt is set rather than row removal so threads
// and pin counts stay consistent. Clients filter deletedAt !== null.

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";

const router = Router();

const ROLE_RANK: Record<string, number> = {
  PNM: 0, ALUMNI: 0, MEMBER: 0, EXEC: 1, SUPER_ADMIN: 2,
};

// ── Channel access helpers ────────────────────────────────────────────────
async function canReadChannel(channelId: string, req: AuthedRequest): Promise<boolean> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return false;

  const rank = ROLE_RANK[req.user!.role];

  if (channel.type === "GENERAL") return true;
  if (channel.type === "OFFICERS") return rank >= ROLE_RANK.EXEC;
  if (rank >= ROLE_RANK.EXEC) return true; // Exec bypasses COMMITTEE + DM scoping

  const membership = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId, userId: req.user!.id } },
  });
  return !!membership;
}

async function canPostToChannel(channelId: string, req: AuthedRequest): Promise<boolean> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return false;

  const rank = ROLE_RANK[req.user!.role];

  if (channel.type === "GENERAL") return rank >= ROLE_RANK.EXEC;
  if (channel.type === "OFFICERS") return rank >= ROLE_RANK.EXEC;
  if (rank >= ROLE_RANK.EXEC) return true;

  const membership = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId, userId: req.user!.id } },
  });
  return !!membership;
}

// ── GET /channels ─────────────────────────────────────────────────────────
// Returns only channels the user can access, with last message preview.
router.get("/channels", async (req: AuthedRequest, res: Response) => {
  const rank = ROLE_RANK[req.user!.role];

  // Collect accessible channel IDs based on type
  const accessibleChannels = await prisma.channel.findMany({
    where: {
      OR: [
        { type: "GENERAL" },
        ...(rank >= ROLE_RANK.EXEC ? [{ type: "OFFICERS" as const }] : []),
        ...(rank >= ROLE_RANK.EXEC
          ? [{ type: "COMMITTEE" as const }, { type: "DM" as const }]
          : [
              {
                type: { in: ["COMMITTEE", "DM"] as Array<"COMMITTEE" | "DM"> },
                members: { some: { userId: req.user!.id } },
              },
            ]),
      ],
    },
    include: {
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { firstName: true, lastName: true } } },
      },
      committee: { select: { id: true, name: true } },
      _count: { select: { messages: { where: { pinned: true, deletedAt: null } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const channels = accessibleChannels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    type: ch.type,
    committeeId: ch.committeeId,
    committee: ch.committee,
    pinnedCount: ch._count.messages,
    lastMessage: ch.messages[0]
      ? {
          content: ch.messages[0].content.slice(0, 80),
          senderName: `${ch.messages[0].sender.firstName} ${ch.messages[0].sender.lastName}`,
          createdAt: ch.messages[0].createdAt,
        }
      : null,
    canPost: canPostToChannelSync(ch.type, rank),
  }));

  res.json({ channels });
});

function canPostToChannelSync(type: string, rank: number): boolean {
  if (type === "GENERAL") return rank >= ROLE_RANK.EXEC;
  if (type === "OFFICERS") return rank >= ROLE_RANK.EXEC;
  // COMMITTEE / DM — caller verified via membership; return true for display
  return true;
}

// ── GET /channels/:id/messages — cursor-based, newest-first ──────────────
router.get("/channels/:id/messages", async (req: AuthedRequest, res: Response) => {
  const canRead = await canReadChannel(req.params.id, req);
  if (!canRead) return res.status(403).json({ error: "Not permitted" });

  const { before, limit = "30" } = req.query;

  const messages = await prisma.message.findMany({
    where: {
      channelId: req.params.id,
      parentMessageId: null, // top-level only; threads fetched separately
      deletedAt: null,
      ...(before ? { createdAt: { lt: new Date(String(before)) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Number(limit) + 1,
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      _count: { select: { replies: { where: { deletedAt: null } } } },
    },
  });

  const hasMore = messages.length > Number(limit);
  const items = hasMore ? messages.slice(0, -1) : messages;

  // Also return pinned messages (always shown at top, regardless of cursor)
  const pinned = await prisma.message.findMany({
    where: { channelId: req.params.id, pinned: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  res.json({
    messages: items,
    pinned,
    hasMore,
    oldestTimestamp: items.length ? items[items.length - 1]?.createdAt : null,
  });
});

// ── POST /channels/:id/messages ───────────────────────────────────────────
const sendSchema = z.object({
  content: z.string().min(1).max(4000),
  parentMessageId: z.string().optional(), // for thread replies
});

router.post("/channels/:id/messages", async (req: AuthedRequest, res: Response) => {
  const canPost = await canPostToChannel(req.params.id, req);
  if (!canPost) return res.status(403).json({ error: "Not permitted" });

  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // If replying to a thread, validate parent is in the same channel
  if (parsed.data.parentMessageId) {
    const parent = await prisma.message.findUnique({
      where: { id: parsed.data.parentMessageId },
    });
    if (!parent || parent.channelId !== req.params.id) {
      return res.status(400).json({ error: "Parent message not in this channel" });
    }
    if (parent.parentMessageId) {
      return res.status(400).json({ error: "Threads cannot be nested" });
    }
  }

  const message = await prisma.message.create({
    data: {
      channelId: req.params.id,
      senderId: req.user!.id,
      content: parsed.data.content,
      parentMessageId: parsed.data.parentMessageId ?? null,
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  });

  res.status(201).json({ message });
});

// ── GET /channels/:channelId/messages/:messageId/thread ──────────────────
router.get(
  "/channels/:channelId/messages/:messageId/thread",
  async (req: AuthedRequest, res: Response) => {
    const canRead = await canReadChannel(req.params.channelId, req);
    if (!canRead) return res.status(403).json({ error: "Not permitted" });

    const parent = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    if (!parent || parent.channelId !== req.params.channelId) {
      return res.status(404).json({ error: "Message not found" });
    }

    const replies = await prisma.message.findMany({
      where: { parentMessageId: req.params.messageId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    res.json({ parent, replies });
  }
);

// ── PATCH /messages/:id/pin — Officer+ ───────────────────────────────────
router.patch(
  "/messages/:id/pin",
  requireRole("EXEC"),
  async (req: AuthedRequest, res: Response) => {
    const { pinned } = req.body as { pinned?: boolean };
    if (typeof pinned !== "boolean") {
      return res.status(400).json({ error: "pinned (boolean) required" });
    }

    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message || message.deletedAt) {
      return res.status(404).json({ error: "Message not found" });
    }

    const updated = await prisma.message.update({
      where: { id: req.params.id },
      data: { pinned },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: pinned ? "MESSAGE_PIN" : "MESSAGE_UNPIN",
      entityType: "Message",
      entityId: message.id,
      after: { pinned, channelId: message.channelId },
    });

    res.json({ message: updated });
  }
);

// ── DELETE /messages/:id — sender or Officer+ ────────────────────────────
router.delete("/messages/:id", async (req: AuthedRequest, res: Response) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message || message.deletedAt) {
    return res.status(404).json({ error: "Message not found" });
  }

  const isSender = message.senderId === req.user!.id;
  const isOfficerPlus = ROLE_RANK[req.user!.role] >= ROLE_RANK.EXEC;

  if (!isSender && !isOfficerPlus) {
    return res.status(403).json({ error: "Not permitted" });
  }

  await prisma.message.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), pinned: false },
  });

  if (!isSender) {
    await writeAuditLog({
      actorId: req.user!.id,
      action: "MESSAGE_DELETE",
      entityType: "Message",
      entityId: message.id,
      before: { senderId: message.senderId, content: message.content.slice(0, 100) },
    });
  }

  res.json({ deleted: true });
});

export default router;
