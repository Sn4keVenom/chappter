// backend/routes/messages.routes.ts
//
// Integration points:
//   · rbac.ts → requirePermission, AuthedRequest, writeAuditLog
//   · schema.prisma → Channel (type: GENERAL|COMMITTEE|OFFICERS|DM,
//     archivedAt), ChannelMembership, Message (soft-delete via deletedAt)
//
// Access model:
//   GENERAL   — all members read AND post. Pinning here is the chapter
//               announcement and needs `messaging.announce` (Regent/Vice
//               Regent by office) — see PATCH /messages/:id/pin.
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
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requirePermission, writeAuditLog, ROLE_RANK, isAtLeast } from "../middleware/rbac";

const router = Router();

// ── Channel access helpers ────────────────────────────────────────────────
async function canReadChannel(channelId: string, req: AuthedRequest): Promise<boolean> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return false;

  const isExecOrAbove = isAtLeast(req.user!.role, "EXEC");

  if (channel.type === "GENERAL") return true;
  if (channel.type === "OFFICERS") return isExecOrAbove;
  if (isExecOrAbove && channel.type === "COMMITTEE") return true; // Exec bypasses COMMITTEE scoping only — DM stays membership-only

  const membership = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId, userId: req.user!.id } },
  });
  return !!membership;
}

async function canPostToChannel(channelId: string, req: AuthedRequest): Promise<boolean> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return false;

  // An archived channel is read-only for everyone, Super Admin included —
  // un-archive it first if it needs to be live again.
  if (channel.archivedAt) return false;

  const isExecOrAbove = isAtLeast(req.user!.role, "EXEC");

  // GENERAL is the whole-chapter channel and is open to every member to post
  // in, not just Exec. Broadcasting to everyone (a PINNED message, which the
  // home dashboard surfaces as the chapter announcement) is the narrow,
  // still-restricted action — see PATCH /messages/:id/pin below.
  if (channel.type === "GENERAL") return true;
  if (channel.type === "OFFICERS") return isExecOrAbove;
  if (isExecOrAbove && channel.type === "COMMITTEE") return true;

  const membership = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId, userId: req.user!.id } },
  });
  return !!membership;
}

function canPostToChannelSync(type: string, rank: number, archivedAt: Date | null): boolean {
  if (archivedAt) return false;
  if (type === "GENERAL") return true; // open to all — see canPostToChannel
  if (type === "OFFICERS") return rank >= ROLE_RANK.EXEC;
  // COMMITTEE / DM — caller verified via membership; return true for display
  return true;
}

// ── GET /channels ─────────────────────────────────────────────────────────
// Returns only channels the user can access, with last message preview.
router.get(
  "/channels",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    // -1 (below every real rank) when there's no role yet, so "no chapter
    // membership" never satisfies an Exec+ check below.
    const rank = req.user!.role ? ROLE_RANK[req.user!.role] : -1;

    // `?includeArchived=true` lets the channel-management UI show retired
    // channels so they can be un-archived; the normal list hides them.
    const includeArchived = String(req.query.includeArchived) === "true";

    // Collect accessible channel IDs based on type
    const accessibleChannels = await prisma.channel.findMany({
      where: {
        ...(includeArchived ? {} : { archivedAt: null }),
        OR: [
          { type: "GENERAL" },
          ...(rank >= ROLE_RANK.EXEC ? [{ type: "OFFICERS" as const }] : []),
          ...(rank >= ROLE_RANK.EXEC ? [{ type: "COMMITTEE" as const }] : []),
          // DM always requires membership, regardless of rank — Exec does not bypass DM privacy.
          {
            type: { in: ["COMMITTEE", "DM"] as Array<"COMMITTEE" | "DM"> },
            members: { some: { userId: req.user!.id } },
          },
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
      archivedAt: ch.archivedAt,
      pinnedCount: ch._count.messages,
      lastMessage: ch.messages[0]
        ? {
            content: ch.messages[0].content.slice(0, 80),
            senderName: `${ch.messages[0].sender.firstName} ${ch.messages[0].sender.lastName}`,
            createdAt: ch.messages[0].createdAt,
          }
        : null,
      canPost: canPostToChannelSync(ch.type, rank, ch.archivedAt),
    }));

    res.json({ channels });
  })
);

// ── GET /channels/:id/messages — cursor-based, newest-first ──────────────
router.get(
  "/channels/:id/messages",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
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
  })
);

// ── POST /channels/:id/messages ───────────────────────────────────────────
const sendSchema = z.object({
  content: z.string().min(1).max(4000),
  parentMessageId: z.string().optional(), // for thread replies
});

router.post(
  "/channels/:id/messages",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
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
  })
);

// ── GET /channels/:channelId/messages/:messageId/thread ──────────────────
router.get(
  "/channels/:channelId/messages/:messageId/thread",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
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
  })
);

// ── PATCH /messages/:id/pin ───────────────────────────────────────────────
// Two different actions wear the same verb, and they have different bars:
//   · Pinning in #general IS the chapter announcement (the home dashboard
//     renders the newest pinned GENERAL message as `pinnedAnnouncement` —
//     see users.routes.ts). Requires `messaging.announce`, granted by
//     office to Regent and Vice Regent, not to Exec at large.
//   · Pinning anywhere else is ordinary moderation — `messaging.moderate`,
//     which the Exec role preset carries.
// Super Admin bypasses both, as everywhere (rbac.ts requirePermission).
router.patch(
  "/messages/:id/pin",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { pinned } = req.body as { pinned?: boolean };
    if (typeof pinned !== "boolean") {
      return res.status(400).json({ error: "pinned (boolean) required" });
    }

    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
      include: { channel: { select: { type: true } } },
    });
    if (!message || message.deletedAt) {
      return res.status(404).json({ error: "Message not found" });
    }

    const isSuperAdmin = req.user!.role === "SUPER_ADMIN";
    const required = message.channel.type === "GENERAL" ? "messaging.announce" : "messaging.moderate";
    if (!isSuperAdmin && !req.user!.permissions?.has(required)) {
      return res.status(403).json({ error: "Not permitted" });
    }

    // The permission check above is chapter-wide, not channel-scoped — nobody
    // is automatically a member of every DM, so re-verify against the same
    // channel-scoping rules reads/posts use before allowing a pin.
    const canAccessChannel = await canReadChannel(message.channelId, req);
    if (!canAccessChannel) return res.status(403).json({ error: "Not permitted" });

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
  })
);

// ── DELETE /messages/:id — sender or Exec+ ────────────────────────────────
router.delete(
  "/messages/:id",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message || message.deletedAt) {
      return res.status(404).json({ error: "Message not found" });
    }

    const isSender = message.senderId === req.user!.id;

    if (!isSender) {
      // Same reasoning as the pin route above: role tier alone doesn't imply
      // access to this specific channel (e.g. a DM the Exec isn't part of).
      const isExecWithAccess =
        isAtLeast(req.user!.role, "EXEC") && (await canReadChannel(message.channelId, req));
      if (!isExecWithAccess) return res.status(403).json({ error: "Not permitted" });
    }

    await prisma.message.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), pinned: false },
    });

    // Only audit-log when an Exec+ removes someone else's message — a
    // routine self-delete of your own message isn't a privileged action
    // worth an audit trail entry.
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
  })
);

// ── POST /channels — messaging.manageChannels ─────────────────────────────
// Creates a standing chapter channel. Deliberately only GENERAL/OFFICERS
// here: COMMITTEE channels are created (and named) automatically alongside
// their committee in committees.routes.ts, and a DM is opened by messaging
// someone, not by an admin declaring one.
const createChannelSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["GENERAL", "OFFICERS"]),
});

router.post(
  "/channels",
  requirePermission("messaging.manageChannels"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = createChannelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Normalized the same way committees.routes.ts names its channels, so
    // every channel in the list reads consistently regardless of origin.
    const name = `#${parsed.data.name.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-")}`;

    const channel = await prisma.channel.create({
      data: { name, type: parsed.data.type },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHANNEL_CREATE",
      entityType: "Channel",
      entityId: channel.id,
      after: { name: channel.name, type: channel.type },
    });

    res.status(201).json({ channel });
  })
);

// ── PATCH /channels/:id/archive — messaging.manageChannels ────────────────
// Reversible: { archived: false } un-archives. Messages are never touched —
// see the Channel.archivedAt doc comment in schema.prisma.
router.patch(
  "/channels/:id/archive",
  requirePermission("messaging.manageChannels"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { archived } = req.body as { archived?: boolean };
    if (typeof archived !== "boolean") {
      return res.status(400).json({ error: "archived (boolean) required" });
    }

    const channel = await prisma.channel.findUnique({ where: { id: req.params.id } });
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    // #general is the one channel the app assumes always exists and is live:
    // the home dashboard reads its pinned announcement, and seed.ts creates
    // it for exactly that reason. Archiving it would silently break that.
    if (archived && channel.type === "GENERAL") {
      return res.status(400).json({ error: "The general channel can't be archived." });
    }

    const updated = await prisma.channel.update({
      where: { id: channel.id },
      data: { archivedAt: archived ? new Date() : null },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: archived ? "CHANNEL_ARCHIVE" : "CHANNEL_UNARCHIVE",
      entityType: "Channel",
      entityId: channel.id,
      before: { archivedAt: channel.archivedAt },
      after: { archivedAt: updated.archivedAt },
    });

    res.json({ channel: updated });
  })
);

export default router;
