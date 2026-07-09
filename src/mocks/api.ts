// src/mocks/api.ts
//
// One function per real backend route, mirroring src/api/*.ts function names
// and return shapes exactly (same field names the real Express routes
// return). src/mocks/router.ts dispatches HTTP-shaped requests into these
// functions; nothing here knows about axios or HTTP status codes — that
// stays in router.ts, same separation the real backend has between
// routes/*.ts and the Prisma calls inside them.
//
// All reads/writes operate on the module-level arrays in seed.ts, so
// mutations (RSVPs, check-ins, sent messages, recorded payments, etc.)
// persist for the session exactly like a real database would.

import * as db from "./seed";
import { getCurrentDemoUser, getCurrentDemoUserId, toAppUser } from "./identity";
import {
  hasPermission,
  isExecOrAbove as roleIsExecOrAbove,
  isSuperAdmin as roleIsSuperAdmin,
  hasAnyManagementAccess,
  hasScopedManagementAccess,
} from "../permissions/permissions";
import type {
  User,
  UserSummary,
  EventSummary,
  EventDetail,
  EventDelegate,
  DashboardData,
  RsvpStatus,
  LeaderboardEntry,
  LedgerEntry,
  RosterEntry,
  AttendanceRecord,
  Committee,
  CommitteeMemberSummary,
  CommitteeMembershipSummary,
  CommitteeRole,
  Channel,
  Message,
  DuesRecord,
  Payment,
  DuesStatus,
  DuesPlan,
  PaymentMethod,
  UserRole,
  ExecOffice,
  MemberStatus,
  Team,
  TeamMemberSummary,
  TeamLeaderboardEntry,
  CommitteeBudget,
  Expense,
  ReimbursementStatus,
  Permission,
  RolePermissions,
  ModuleConfig,
  ModuleKey,
  ChapterSettings,
  ChapterDocument,
  DocumentCategory,
  ExternalLink,
  FeedbackType,
  FeedbackStatus,
  FeedbackReport,
} from "../types";

// ── Shared helpers ─────────────────────────────────────────────────────────
// All permission logic is delegated to permissions/permissions.ts — the
// exact same engine the client's usePermissions.ts hook uses — so the two
// can never drift apart. These wrappers just resolve a userId to the data
// that engine needs (role/status/committeeChairOf/current permission map).

function committeeChairOf(userId: string): string[] {
  return db.committeeMemberships
    .filter((m) => m.userId === userId && m.role === "CHAIR")
    .map((m) => m.committeeId);
}

function can(userId: string, permission: Permission): boolean {
  const u = db.findUser(userId);
  if (!u) return false;
  return hasPermission(u.role, db.rolePermissions, permission);
}

function isExecOrAbove(userId: string): boolean {
  const u = db.findUser(userId);
  return !!u && roleIsExecOrAbove(u.role);
}

function isOfficerOrAbove(userId: string): boolean {
  const u = db.findUser(userId);
  if (!u) return false;
  return hasAnyManagementAccess({ role: u.role, status: u.status, committeeChairOf: committeeChairOf(userId) });
}

function isSuperAdmin(userId: string): boolean {
  const u = db.findUser(userId);
  return !!u && roleIsSuperAdmin(u.role);
}

// Named exec-board office checks (Vice Regent/Scribe/Treasurer). Additive to
// the permission checks above — see usePermissions.ts for the client-side
// mirror and the "why additive, not exclusive" reasoning.
function isViceRegentOrAdmin(userId: string): boolean {
  const u = db.findUser(userId);
  return isSuperAdmin(userId) || u?.office === "VICE_REGENT";
}

function isScribeOrAdmin(userId: string): boolean {
  const u = db.findUser(userId);
  return isSuperAdmin(userId) || u?.office === "SCRIBE";
}

function isTreasurerOrAdmin(userId: string): boolean {
  const u = db.findUser(userId);
  return isSuperAdmin(userId) || u?.office === "TREASURER";
}

function committeeManageAccess(userId: string, committeeId: string): boolean {
  const u = db.findUser(userId);
  if (!u) return false;
  return hasScopedManagementAccess({ role: u.role, status: u.status, committeeChairOf: committeeChairOf(userId), committeeId });
}

// Can this user generate/display THIS event's check-in code? Exec+, Scribe,
// the committee chair who owns this event, or an explicitly delegated
// member (Feature 3) — delegation grants access to ONLY this one event,
// not general attendance-management authority.
function canAccessCheckIn(userId: string, event: db.MockEvent): boolean {
  if (isExecOrAbove(userId) || isScribeOrAdmin(userId)) return true;
  if (event.committeeId && committeeManageAccess(userId, event.committeeId)) return true;
  return db.getEventDelegates(event.id).some((d) => d.userId === userId);
}

export class DemoApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

// ── Events ───────────────────────────────────────────────────────────────

function toEventSummary(event: db.MockEvent, forUserId: string): EventSummary {
  const committee = event.committeeId ? db.committees.find((c) => c.id === event.committeeId) : null;
  const rsvp = db.findRsvp(event.id, forUserId);
  const attendance = db.findAttendance(event.id, forUserId);
  return {
    id: event.id,
    title: event.title,
    location: event.location ?? null,
    category: event.category,
    startTime: event.startTime,
    endTime: event.endTime,
    attendanceRequired: event.attendanceRequired,
    pointValue: event.pointValue,
    committeeId: event.committeeId ?? null,
    committee: committee ? { id: committee.id, name: committee.name } : null,
    myRsvpStatus: rsvp?.status ?? null,
    myAttendance: attendance ? { pointsAwarded: attendance.pointsAwarded, late: attendance.late } : null,
  };
}

function toEventDelegates(eventId: string): EventDelegate[] {
  return db
    .getEventDelegates(eventId)
    .map((d) => db.findUser(d.userId))
    .filter((u): u is db.MockUser => !!u)
    .map((u) => ({ userId: u.id, firstName: u.firstName, lastName: u.lastName }));
}

function toEventDetail(event: db.MockEvent, forUserId: string): EventDetail {
  const checkedInCount = db.attendances.filter((a) => a.eventId === event.id).length;
  return {
    ...toEventSummary(event, forUserId),
    description: event.description ?? null,
    status: event.status,
    checkInWindowStart: event.checkInWindowStart ?? null,
    checkInWindowEnd: event.checkInWindowEnd ?? null,
    checkedInCount,
    attendanceDelegates: toEventDelegates(event.id),
  };
}

export function getEvent(eventId: string): EventDetail {
  const event = db.findEvent(eventId);
  if (!event) throw new DemoApiError(404, "Event not found");
  return toEventDetail(event, getCurrentDemoUserId());
}

export function listEvents(params: { from?: string; to?: string; category?: string; committeeId?: string }): EventSummary[] {
  const userId = getCurrentDemoUserId();
  let list = db.events.filter((e) => e.status === "PUBLISHED");
  if (params.from) list = list.filter((e) => e.endTime >= params.from!);
  if (params.to) list = list.filter((e) => e.endTime <= params.to!);
  if (params.category) list = list.filter((e) => e.category === params.category);
  if (params.committeeId) list = list.filter((e) => e.committeeId === params.committeeId);
  return list
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((e) => toEventSummary(e, userId));
}

export function createEvent(payload: {
  title: string;
  description?: string;
  location?: string;
  category: string;
  startTime: string;
  endTime: string;
  attendanceRequired: boolean;
  pointValue: number;
  committeeId?: string | null;
}): EventDetail {
  const userId = getCurrentDemoUserId();
  const event: db.MockEvent = {
    id: db.nextId("e"),
    title: payload.title,
    description: payload.description ?? null,
    location: payload.location ?? null,
    category: payload.category as db.MockEvent["category"],
    status: "PUBLISHED",
    startTime: payload.startTime,
    endTime: payload.endTime,
    attendanceRequired: payload.attendanceRequired,
    pointValue: payload.pointValue,
    committeeId: payload.committeeId ?? null,
    createdById: userId,
  };
  db.events.push(event);
  return toEventDetail(event, userId);
}

export function setRsvp(eventId: string, status: RsvpStatus): void {
  const userId = getCurrentDemoUserId();
  if (!db.findEvent(eventId)) throw new DemoApiError(404, "Event not found");
  const existing = db.findRsvp(eventId, userId);
  if (existing) {
    existing.status = status;
    existing.respondedAt = new Date().toISOString();
  } else {
    db.rsvps.push({ eventId, userId, status, respondedAt: new Date().toISOString() });
  }
}

// ── Users / Dashboard / Points ──────────────────────────────────────────

function toUserSummary(u: db.MockUser): UserSummary {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    avatarUrl: u.avatarUrl ?? null,
    role: u.role,
    office: u.office ?? null,
    status: u.status,
    pledgeClassLabel: u.pledgeClassLabel ?? null,
  };
}

function toFullUser(u: db.MockUser): User {
  const memberships: CommitteeMembershipSummary[] = db.committeeMemberships
    .filter((m) => m.userId === u.id)
    .map((m) => ({
      committeeId: m.committeeId,
      committeeName: db.committees.find((c) => c.id === m.committeeId)?.name ?? "",
      role: m.role,
    }));
  const team = u.teamId ? db.findTeam(u.teamId) : undefined;
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone ?? null,
    avatarUrl: u.avatarUrl ?? null,
    role: u.role,
    office: u.office ?? null,
    status: u.status,
    pledgeClassLabel: u.pledgeClassLabel ?? null,
    committeeChairOf: committeeChairOf(u.id),
    committeeMemberships: memberships,
    teamId: u.teamId ?? null,
    teamName: team?.name ?? null,
  };
}

export function getMe(): User {
  return toFullUser(getCurrentDemoUser());
}

function userTotalPoints(userId: string): number {
  return db.ledgerEntries
    .filter((l) => l.userId === userId && l.semesterId === db.semester.id)
    .reduce((sum, l) => sum + l.amount, 0);
}

interface PointsBreakdown {
  total: number;
  attendanceCount: number;
  attendancePoints: number;
  bonusPoints: number;
  penaltyPoints: number;
}

// Individual point totals come primarily from attendance/event
// participation (Feature 1) — this breaks the ledger down by type so the
// leaderboard can show "how" someone earned their points, not just the sum.
function userPointsBreakdown(userId: string): PointsBreakdown {
  const entries = db.ledgerEntries.filter((l) => l.userId === userId && l.semesterId === db.semester.id);
  let total = 0;
  let attendanceCount = 0;
  let attendancePoints = 0;
  let bonusPoints = 0;
  let penaltyPoints = 0;
  for (const l of entries) {
    total += l.amount;
    if (l.type === "ATTENDANCE") {
      attendanceCount += 1;
      attendancePoints += l.amount;
    } else if (l.type === "BONUS") {
      bonusPoints += l.amount;
    } else if (l.type === "PENALTY") {
      penaltyPoints += l.amount;
    }
  }
  return { total, attendanceCount, attendancePoints, bonusPoints, penaltyPoints };
}

function leaderboardRows(): LeaderboardEntry[] {
  const userId = getCurrentDemoUserId();
  const scored = db.users
    .filter((u) => u.status === "ACTIVE" || u.status === "PNM")
    .map((u) => ({ u, breakdown: userPointsBreakdown(u.id) }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total);
  return scored.map(({ u, breakdown }, i) => ({
    rank: i + 1,
    userId: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl ?? null,
    total: breakdown.total,
    isMe: u.id === userId,
    attendanceCount: breakdown.attendanceCount,
    attendancePoints: breakdown.attendancePoints,
    bonusPoints: breakdown.bonusPoints,
    penaltyPoints: breakdown.penaltyPoints,
  }));
}

export function getDashboard(): DashboardData {
  const userId = getCurrentDemoUserId();
  const now = new Date().toISOString();
  const weekOut = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const upcomingEvents = db.events
    .filter((e) => e.status === "PUBLISHED" && e.startTime >= now && e.startTime <= weekOut)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((e) => toEventSummary(e, userId));

  const dues = db.findDuesRecord(userId, db.semester.id);
  const board = leaderboardRows();
  const me = board.find((b) => b.userId === userId);

  const pinned = db.messages
    .filter((m) => m.channelId === "ch1" && m.pinned && !m.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const pinnedSender = pinned ? db.findUser(pinned.senderId) : undefined;

  return {
    upcomingEvents,
    duesRecord: dues ? toDuesRecord(dues) : null,
    points: { total: me?.total ?? 0, rank: me?.rank ?? null, semesterLabel: db.semester.label },
    pinnedAnnouncement: pinned
      ? {
          id: pinned.id,
          content: pinned.content,
          createdAt: pinned.createdAt,
          senderName: pinnedSender ? `${pinnedSender.firstName} ${pinnedSender.lastName}` : "Chapter",
        }
      : null,
  };
}

export function getRoster(params: { q?: string; role?: string; status?: string; page?: number; limit?: number }): {
  users: UserSummary[];
  total: number;
} {
  let list = db.users.slice();
  if (params.q) {
    const q = params.q.toLowerCase();
    list = list.filter(
      (u) =>
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }
  if (params.role) list = list.filter((u) => u.role === params.role);
  if (params.status) list = list.filter((u) => u.status === params.status);
  const total = list.length;
  const limit = params.limit ?? 50;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  list = list.slice(start, start + limit);
  return { users: list.map(toUserSummary), total };
}

export function getMemberProfile(userId: string): User {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");
  return toFullUser(u);
}

export function updateUserRole(userId: string, role: UserRole): User {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");
  if (!can(getCurrentDemoUserId(), "users.manage")) {
    throw new DemoApiError(403, "Not authorized to change member roles");
  }
  u.role = role;
  return toFullUser(u);
}

// Fuller editor (spec §4 — Super Admin: manage users, assign roles, assign
// exec offices). Same authorization as updateUserRole; office/status are
// independent fields (see types/index.ts doc comment) so each is optional
// and only touched when present in the payload.
export function updateUserFields(
  userId: string,
  payload: { role?: UserRole; office?: ExecOffice | null; status?: MemberStatus }
): User {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");
  if (!can(getCurrentDemoUserId(), "users.manage")) {
    throw new DemoApiError(403, "Not authorized to edit member roles/status");
  }
  if (payload.role !== undefined) u.role = payload.role;
  if (payload.office !== undefined) u.office = payload.office;
  if (payload.status !== undefined) u.status = payload.status;
  return toFullUser(u);
}

export function getLeaderboard(): { leaderboard: LeaderboardEntry[]; semesterLabel: string | null } {
  return { leaderboard: leaderboardRows(), semesterLabel: db.semester.label };
}

export function getPointsLedger(
  userId: string,
  params: { semesterId?: string; limit?: number; cursor?: string }
): { entries: LedgerEntry[]; total: number; nextCursor: string | null } {
  const semesterId = params.semesterId ?? db.semester.id;
  const all = db.ledgerEntries
    .filter((l) => l.userId === userId && l.semesterId === semesterId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = params.limit ?? 30;
  const startIdx = params.cursor ? all.findIndex((e) => e.id === params.cursor) + 1 : 0;
  const page = all.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < all.length ? page[page.length - 1]?.id ?? null : null;

  const entries: LedgerEntry[] = page.map((l) => {
    const event = l.eventId ? db.findEvent(l.eventId) : null;
    const awardedBy = l.awardedById ? db.findUser(l.awardedById) : null;
    return {
      id: l.id,
      amount: l.amount,
      type: l.type,
      reason: l.reason ?? null,
      createdAt: l.createdAt,
      event: event ? { id: event.id, title: event.title, category: event.category } : null,
      awardedBy: awardedBy ? { firstName: awardedBy.firstName, lastName: awardedBy.lastName } : null,
    };
  });

  return { entries, total: all.length, nextCursor };
}

export function adjustPoints(payload: {
  userId: string;
  semesterId: string;
  amount: number;
  type: "BONUS" | "PENALTY" | "MANUAL_ADJUSTMENT";
  reason: string;
}): LedgerEntry {
  const permission = payload.amount < 0 ? "points.deduct" : "points.award";
  if (!can(getCurrentDemoUserId(), permission)) {
    throw new DemoApiError(403, "Not authorized to adjust points");
  }
  if (!db.findUser(payload.userId)) throw new DemoApiError(404, "User not found");
  const entry: db.MockLedgerEntry = {
    id: db.nextId("ldg"),
    userId: payload.userId,
    eventId: null,
    semesterId: payload.semesterId,
    amount: payload.amount,
    type: payload.type,
    reason: payload.reason,
    awardedById: getCurrentDemoUserId(),
    createdAt: new Date().toISOString(),
  };
  db.ledgerEntries.push(entry);
  const awardedBy = db.findUser(entry.awardedById!);
  return {
    id: entry.id,
    amount: entry.amount,
    type: entry.type,
    reason: entry.reason,
    createdAt: entry.createdAt,
    event: null,
    awardedBy: awardedBy ? { firstName: awardedBy.firstName, lastName: awardedBy.lastName } : null,
  };
}

// ── Attendance ───────────────────────────────────────────────────────────

export function getEventRoster(eventId: string): {
  roster: RosterEntry[];
  checkedInCount: number;
  event: { id: string; title: string; pointValue: number };
} {
  const event = db.findEvent(eventId);
  if (!event) throw new DemoApiError(404, "Event not found");

  const userIds = new Set<string>();
  db.rsvps.filter((r) => r.eventId === eventId).forEach((r) => userIds.add(r.userId));
  db.attendances.filter((a) => a.eventId === eventId).forEach((a) => userIds.add(a.userId));

  const roster: RosterEntry[] = Array.from(userIds)
    .map((userId) => db.findUser(userId))
    .filter((u): u is db.MockUser => !!u)
    .map((u) => {
      const rsvp = db.findRsvp(eventId, u.id);
      const attendance = db.findAttendance(eventId, u.id);
      return {
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        pledgeClassLabel: u.pledgeClassLabel ?? null,
        rsvpStatus: rsvp?.status ?? null,
        attendance: attendance
          ? {
              id: attendance.id,
              checkInTime: attendance.checkInTime,
              method: attendance.method,
              late: attendance.late,
              pointsAwarded: attendance.pointsAwarded,
            }
          : null,
      };
    })
    .sort((a, b) => `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`));

  return {
    roster,
    checkedInCount: db.attendances.filter((a) => a.eventId === eventId).length,
    event: { id: event.id, title: event.title, pointValue: event.pointValue },
  };
}

export function manualMarkAttendance(
  eventId: string,
  userId: string,
  payload: { action: "mark_present" | "remove"; overrideReason: string; late?: boolean }
): { attendance?: AttendanceRecord; removed?: boolean } {
  if (!isOfficerOrAbove(getCurrentDemoUserId())) {
    throw new DemoApiError(403, "Officer+ required");
  }
  const event = db.findEvent(eventId);
  const user = db.findUser(userId);
  if (!event || !user) throw new DemoApiError(404, "Event or user not found");

  if (payload.action === "remove") {
    const idx = db.attendances.findIndex((a) => a.eventId === eventId && a.userId === userId);
    if (idx >= 0) db.attendances.splice(idx, 1);
    const ledgerIdx = db.ledgerEntries.findIndex(
      (l) => l.eventId === eventId && l.userId === userId && l.type === "ATTENDANCE"
    );
    if (ledgerIdx >= 0) db.ledgerEntries.splice(ledgerIdx, 1);
    return { removed: true };
  }

  const existing = db.findAttendance(eventId, userId);
  if (existing) {
    return {
      attendance: {
        id: existing.id,
        checkInTime: existing.checkInTime,
        method: existing.method,
        late: existing.late,
        pointsAwarded: existing.pointsAwarded,
        overrideReason: existing.overrideReason ?? null,
        event: { id: event.id, title: event.title, category: event.category, startTime: event.startTime },
      },
    };
  }

  const attendance: db.MockAttendance = {
    id: db.nextId("att"),
    eventId,
    userId,
    checkInTime: new Date().toISOString(),
    method: "MANUAL",
    late: payload.late ?? false,
    pointsAwarded: event.pointValue,
    overrideReason: payload.overrideReason,
    recordedById: getCurrentDemoUserId(),
  };
  db.attendances.push(attendance);
  db.ledgerEntries.push({
    id: db.nextId("ldg"),
    userId,
    eventId,
    semesterId: db.semester.id,
    amount: event.pointValue,
    type: "ATTENDANCE",
    reason: `Manual override: ${payload.overrideReason}`,
    awardedById: getCurrentDemoUserId(),
    createdAt: attendance.checkInTime,
  });

  return {
    attendance: {
      id: attendance.id,
      checkInTime: attendance.checkInTime,
      method: attendance.method,
      late: attendance.late,
      pointsAwarded: attendance.pointsAwarded,
      overrideReason: attendance.overrideReason,
      event: { id: event.id, title: event.title, category: event.category, startTime: event.startTime },
    },
  };
}

function toAttendanceRecord(a: db.MockAttendance): AttendanceRecord {
  const event = db.findEvent(a.eventId)!;
  return {
    id: a.id,
    checkInTime: a.checkInTime,
    method: a.method,
    late: a.late,
    pointsAwarded: a.pointsAwarded,
    overrideReason: a.overrideReason ?? null,
    event: { id: event.id, title: event.title, category: event.category, startTime: event.startTime },
  };
}

export function getMyAttendanceHistory(params: { limit?: number; cursor?: string }): {
  records: AttendanceRecord[];
  nextCursor: string | null;
} {
  return getMemberAttendanceHistoryPaged(getCurrentDemoUserId(), params);
}

function getMemberAttendanceHistoryPaged(
  userId: string,
  params: { limit?: number; cursor?: string }
): { records: AttendanceRecord[]; nextCursor: string | null } {
  const all = db.attendances
    .filter((a) => a.userId === userId)
    .sort((a, b) => b.checkInTime.localeCompare(a.checkInTime));
  const limit = params.limit ?? 20;
  const startIdx = params.cursor ? all.findIndex((a) => a.id === params.cursor) + 1 : 0;
  const page = all.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < all.length ? page[page.length - 1]?.id ?? null : null;
  return { records: page.map(toAttendanceRecord), nextCursor };
}

export function getMemberAttendanceHistory(userId: string): { records: AttendanceRecord[] } {
  const { records } = getMemberAttendanceHistoryPaged(userId, { limit: 100 });
  return { records };
}

const activeCheckInTokens = new Map<string, { eventId: string; expiresAt: number }>();

export function getCheckInToken(eventId: string): { token: string; expiresAt: number } {
  const event = db.findEvent(eventId);
  if (!event) throw new DemoApiError(404, "Event not found");
  if (!canAccessCheckIn(getCurrentDemoUserId(), event)) {
    throw new DemoApiError(403, "You don't have access to generate this event's check-in code");
  }
  const token = `demo-checkin:${eventId}:${db.nextId("tok")}`;
  const expiresAt = Date.now() + 60_000;
  activeCheckInTokens.set(token, { eventId, expiresAt });
  return { token, expiresAt };
}

export function selfCheckIn(eventId: string, token: string): { attendance: AttendanceRecord; alreadyCheckedIn?: boolean } {
  const userId = getCurrentDemoUserId();
  const event = db.findEvent(eventId);
  if (!event) throw new DemoApiError(404, "Event not found");

  const existing = db.findAttendance(eventId, userId);
  if (existing) {
    return { attendance: toAttendanceRecord(existing), alreadyCheckedIn: true };
  }

  // Demo mode is lenient about the scanned payload — any non-empty code
  // checks you in, since testing a real two-device QR handoff isn't
  // possible for someone evaluating the app solo. A token minted by
  // getCheckInToken() above for THIS event is still preferred/validated
  // when present.
  if (!token || !token.trim()) {
    throw new DemoApiError(400, "Invalid or expired check-in code");
  }

  const attendance: db.MockAttendance = {
    id: db.nextId("att"),
    eventId,
    userId,
    checkInTime: new Date().toISOString(),
    method: "QR",
    late: false,
    pointsAwarded: event.pointValue,
    recordedById: null,
  };
  db.attendances.push(attendance);
  db.ledgerEntries.push({
    id: db.nextId("ldg"),
    userId,
    eventId,
    semesterId: db.semester.id,
    amount: event.pointValue,
    type: "ATTENDANCE",
    reason: null,
    awardedById: null,
    createdAt: attendance.checkInTime,
  });

  return { attendance: toAttendanceRecord(attendance) };
}

// Who can ADD/REMOVE delegates for an event — deliberately narrower than
// canAccessCheckIn (a delegate can generate the code but can't delegate
// further; only the people who'd manage the event generally can).
function canManageDelegates(userId: string, event: db.MockEvent): boolean {
  if (isExecOrAbove(userId) || isScribeOrAdmin(userId)) return true;
  return isOfficerOrAbove(userId) && !!event.committeeId && committeeChairOf(userId).includes(event.committeeId);
}

export function addEventDelegate(eventId: string, userId: string): EventDelegate[] {
  const event = db.findEvent(eventId);
  const user = db.findUser(userId);
  if (!event || !user) throw new DemoApiError(404, "Event or user not found");
  if (!canManageDelegates(getCurrentDemoUserId(), event)) {
    throw new DemoApiError(403, "Only the event's organizer can assign check-in delegates");
  }
  if (!db.eventDelegates.some((d) => d.eventId === eventId && d.userId === userId)) {
    db.eventDelegates.push({ eventId, userId });
  }
  return toEventDelegates(eventId);
}

export function removeEventDelegate(eventId: string, userId: string): EventDelegate[] {
  const event = db.findEvent(eventId);
  if (!event) throw new DemoApiError(404, "Event not found");
  if (!canManageDelegates(getCurrentDemoUserId(), event)) {
    throw new DemoApiError(403, "Only the event's organizer can remove check-in delegates");
  }
  const idx = db.eventDelegates.findIndex((d) => d.eventId === eventId && d.userId === userId);
  if (idx >= 0) db.eventDelegates.splice(idx, 1);
  return toEventDelegates(eventId);
}

// ── Committees ───────────────────────────────────────────────────────────

function toCommittee(c: db.MockCommittee): Committee {
  const members: CommitteeMemberSummary[] = db.committeeMemberships
    .filter((m) => m.committeeId === c.id)
    .map((m) => {
      const u = db.findUser(m.userId)!;
      return { userId: u.id, firstName: u.firstName, lastName: u.lastName, avatarUrl: u.avatarUrl ?? null, role: m.role };
    })
    .sort((a, b) => (a.role === b.role ? a.firstName.localeCompare(b.firstName) : a.role === "CHAIR" ? -1 : 1));
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    channelId: c.channelId ?? null,
    memberCount: members.length,
    members,
  };
}

export function listCommittees(): Committee[] {
  return db.committees.map(toCommittee);
}

export function getCommittee(id: string): Committee {
  const c = db.committees.find((x) => x.id === id);
  if (!c) throw new DemoApiError(404, "Committee not found");
  return toCommittee(c);
}

export function createCommittee(payload: { name: string; description?: string }): Committee {
  if (!can(getCurrentDemoUserId(), "committees.manage")) throw new DemoApiError(403, "Not authorized to create committees");
  const committee: db.MockCommittee = {
    id: db.nextId("c"),
    name: payload.name,
    description: payload.description ?? null,
    channelId: null,
  };
  db.committees.push(committee);
  return toCommittee(committee);
}

export function updateCommittee(id: string, payload: { name?: string; description?: string }): Committee {
  const c = db.committees.find((x) => x.id === id);
  if (!c) throw new DemoApiError(404, "Committee not found");
  if (!can(getCurrentDemoUserId(), "committees.manage") && !committeeManageAccess(getCurrentDemoUserId(), id)) {
    throw new DemoApiError(403, "Not authorized to edit this committee");
  }
  if (payload.name !== undefined) c.name = payload.name;
  if (payload.description !== undefined) c.description = payload.description;
  return toCommittee(c);
}

export function addCommitteeMember(
  committeeId: string,
  payload: { userId: string; role?: CommitteeRole }
): CommitteeMembershipSummary {
  const c = db.committees.find((x) => x.id === committeeId);
  const u = db.findUser(payload.userId);
  if (!c || !u) throw new DemoApiError(404, "Committee or user not found");
  if (!can(getCurrentDemoUserId(), "committees.manage") && !committeeManageAccess(getCurrentDemoUserId(), committeeId)) {
    throw new DemoApiError(403, "Not authorized to manage this committee's members");
  }
  const existing = db.committeeMemberships.find((m) => m.committeeId === committeeId && m.userId === payload.userId);
  if (!existing) {
    db.committeeMemberships.push({ committeeId, userId: payload.userId, role: payload.role ?? "MEMBER" });
  }
  return { committeeId, committeeName: c.name, role: payload.role ?? "MEMBER" };
}

export function removeCommitteeMember(committeeId: string, userId: string): void {
  if (!can(getCurrentDemoUserId(), "committees.manage") && !committeeManageAccess(getCurrentDemoUserId(), committeeId)) {
    throw new DemoApiError(403, "Not authorized to manage this committee's members");
  }
  const idx = db.committeeMemberships.findIndex((m) => m.committeeId === committeeId && m.userId === userId);
  if (idx >= 0) db.committeeMemberships.splice(idx, 1);
}

// ── Teams ────────────────────────────────────────────────────────────────
// Gamification-only groupings (Feature 2) — NOT committees, no leaders. A
// member belongs to at most one team at a time; team points are always
// derived by summing current members' individual point totals, never
// stored separately, so they can never drift from the individual
// leaderboard (Feature 1).

function toTeam(t: db.MockTeam): Team {
  const memberUsers = db.users.filter((u) => u.teamId === t.id);
  const members: TeamMemberSummary[] = memberUsers
    .map((u) => ({
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      avatarUrl: u.avatarUrl ?? null,
      points: userTotalPoints(u.id),
    }))
    .sort((a, b) => b.points - a.points);
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    memberCount: members.length,
    totalPoints: members.reduce((sum, m) => sum + m.points, 0),
    members,
  };
}

export function listTeams(): Team[] {
  return db.teams.map(toTeam);
}

export function getTeam(id: string): Team {
  const t = db.findTeam(id);
  if (!t) throw new DemoApiError(404, "Team not found");
  return toTeam(t);
}

export function getTeamLeaderboard(): { leaderboard: TeamLeaderboardEntry[]; semesterLabel: string | null } {
  const userId = getCurrentDemoUserId();
  const myTeamId = db.findUser(userId)?.teamId ?? null;
  const ranked = db.teams
    .map((t) => toTeam(t))
    .sort((a, b) => b.totalPoints - a.totalPoints);
  const leaderboard: TeamLeaderboardEntry[] = ranked.map((t, i) => ({
    rank: i + 1,
    teamId: t.id,
    teamName: t.name,
    color: t.color,
    totalPoints: t.totalPoints,
    memberCount: t.memberCount,
    isMyTeam: t.id === myTeamId,
  }));
  return { leaderboard, semesterLabel: db.semester.label };
}

export function addTeamMember(teamId: string, userId: string): Team {
  if (!can(getCurrentDemoUserId(), "teams.manage")) throw new DemoApiError(403, "Not authorized to manage teams");
  const team = db.findTeam(teamId);
  const user = db.findUser(userId);
  if (!team || !user) throw new DemoApiError(404, "Team or user not found");
  user.teamId = teamId; // a member is on at most one team — this reassigns
  return toTeam(team);
}

export function removeTeamMember(teamId: string, userId: string): Team {
  if (!can(getCurrentDemoUserId(), "teams.manage")) throw new DemoApiError(403, "Not authorized to manage teams");
  const team = db.findTeam(teamId);
  const user = db.findUser(userId);
  if (!team || !user) throw new DemoApiError(404, "Team or user not found");
  if (user.teamId === teamId) user.teamId = null;
  return toTeam(team);
}

// ── Messaging ────────────────────────────────────────────────────────────

function channelCanPost(channel: db.MockChannel, userId: string): boolean {
  const u = db.findUser(userId);
  if (!u) return false;
  switch (channel.type) {
    case "GENERAL":
      return isExecOrAbove(userId);
    case "OFFICERS":
      return isOfficerOrAbove(userId);
    case "COMMITTEE":
      return (
        isExecOrAbove(userId) ||
        db.channelMemberships.some((m) => m.channelId === channel.id && m.userId === userId)
      );
    case "DM":
      return db.channelMemberships.some((m) => m.channelId === channel.id && m.userId === userId);
  }
}

function channelVisible(channel: db.MockChannel, userId: string): boolean {
  const u = db.findUser(userId);
  if (!u) return false;
  if (channel.type === "GENERAL") return true;
  if (channel.type === "OFFICERS") return isOfficerOrAbove(userId);
  // COMMITTEE / DM — membership required, Exec+ can see all committee channels
  if (channel.type === "COMMITTEE" && isExecOrAbove(userId)) return true;
  return db.channelMemberships.some((m) => m.channelId === channel.id && m.userId === userId);
}

function toChannel(c: db.MockChannel, userId: string): Channel {
  const committee = c.committeeId ? db.committees.find((x) => x.id === c.committeeId) : null;
  const last = db.messages
    .filter((m) => m.channelId === c.id && !m.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lastSender = last ? db.findUser(last.senderId) : undefined;
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    committeeId: c.committeeId ?? null,
    committee: committee ? { id: committee.id, name: committee.name } : null,
    canPost: channelCanPost(c, userId),
    pinnedCount: db.messages.filter((m) => m.channelId === c.id && m.pinned && !m.deletedAt).length,
    lastMessage: last
      ? {
          content: last.content,
          senderName: lastSender ? `${lastSender.firstName} ${lastSender.lastName}` : "Unknown",
          createdAt: last.createdAt,
        }
      : null,
  };
}

export function listChannels(): Channel[] {
  const userId = getCurrentDemoUserId();
  return db.channels.filter((c) => channelVisible(c, userId)).map((c) => toChannel(c, userId));
}

function toMessage(m: db.MockMessage): Message {
  const sender = db.findUser(m.senderId)!;
  const replyCount = db.messages.filter((r) => r.parentMessageId === m.id && !r.deletedAt).length;
  return {
    id: m.id,
    channelId: m.channelId,
    content: m.content,
    pinned: m.pinned,
    parentMessageId: m.parentMessageId ?? null,
    createdAt: m.createdAt,
    editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null,
    sender: { id: sender.id, firstName: sender.firstName, lastName: sender.lastName, avatarUrl: sender.avatarUrl ?? null },
    _count: { replies: replyCount },
  };
}

export function getChannelMessages(
  channelId: string,
  params: { before?: string; limit?: number }
): { messages: Message[]; pinned: Message[]; hasMore: boolean; oldestTimestamp: string | null } {
  let all = db.messages
    .filter((m) => m.channelId === channelId && !m.deletedAt && !m.parentMessageId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (params.before) all = all.filter((m) => m.createdAt < params.before!);
  const limit = params.limit ?? 30;
  const page = all.slice(0, limit);
  const hasMore = all.length > limit;
  const pinned = db.messages
    .filter((m) => m.channelId === channelId && m.pinned && !m.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    messages: page.map(toMessage),
    pinned: pinned.map(toMessage),
    hasMore,
    oldestTimestamp: page.length ? page[page.length - 1].createdAt : null,
  };
}

export function getThread(channelId: string, messageId: string): { parent: Message; replies: Message[] } {
  const parent = db.findMessage(messageId);
  if (!parent || parent.channelId !== channelId) throw new DemoApiError(404, "Message not found");
  const replies = db.messages
    .filter((m) => m.parentMessageId === messageId && !m.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { parent: toMessage(parent), replies: replies.map(toMessage) };
}

export function sendMessage(channelId: string, payload: { content: string; parentMessageId?: string }): Message {
  const userId = getCurrentDemoUserId();
  const channel = db.channels.find((c) => c.id === channelId);
  if (!channel) throw new DemoApiError(404, "Channel not found");
  if (!channelCanPost(channel, userId)) throw new DemoApiError(403, "You can't post in this channel");
  const message: db.MockMessage = {
    id: db.nextId("msg"),
    channelId,
    senderId: userId,
    content: payload.content,
    parentMessageId: payload.parentMessageId ?? null,
    pinned: false,
    createdAt: new Date().toISOString(),
  };
  db.messages.push(message);
  return toMessage(message);
}

export function pinMessage(messageId: string, pinned: boolean): Message {
  if (!isOfficerOrAbove(getCurrentDemoUserId())) throw new DemoApiError(403, "Officer+ required");
  const m = db.findMessage(messageId);
  if (!m) throw new DemoApiError(404, "Message not found");
  m.pinned = pinned;
  return toMessage(m);
}

export function deleteMessage(messageId: string): void {
  const m = db.findMessage(messageId);
  if (!m) throw new DemoApiError(404, "Message not found");
  const userId = getCurrentDemoUserId();
  if (m.senderId !== userId && !isOfficerOrAbove(userId)) {
    throw new DemoApiError(403, "You can only delete your own messages");
  }
  m.deletedAt = new Date().toISOString();
}

// ── Dues ─────────────────────────────────────────────────────────────────

function toDuesRecord(d: db.MockDuesRecord): DuesRecord {
  const recordPayments = db.payments.filter((p) => p.duesRecordId === d.id);
  return {
    id: d.id,
    userId: d.userId,
    semesterId: d.semesterId,
    amountOwed: d.amountOwed,
    amountPaid: d.amountPaid,
    status: d.status,
    dueDate: d.dueDate ?? null,
    plan: d.plan ?? null,
    semester: { id: db.semester.id, label: db.semester.label },
    payments: recordPayments.map(toPayment),
  };
}

function toPayment(p: db.MockPayment): Payment {
  return { id: p.id, amount: p.amount, method: p.method, externalRef: p.externalRef ?? null, paidAt: p.paidAt };
}

export function getMyDues(): DuesRecord[] {
  const userId = getCurrentDemoUserId();
  return db.duesRecords
    .filter((d) => d.userId === userId)
    .sort((a, b) => b.semesterId.localeCompare(a.semesterId))
    .map(toDuesRecord);
}

export function getAllDues(params: { semesterId?: string; status?: string }): {
  records: (DuesRecord & { user: { id: string; firstName: string; lastName: string; email: string } })[];
  summary: { status: string; _count: { _all: number }; _sum: { amountOwed: number; amountPaid: number } }[];
} {
  if (!can(getCurrentDemoUserId(), "dues.manage")) throw new DemoApiError(403, "Not authorized to view dues");
  let list = db.duesRecords.filter((d) => d.semesterId === (params.semesterId ?? db.semester.id));
  if (params.status) list = list.filter((d) => d.status === params.status);

  const records = list.map((d) => {
    const u = db.findUser(d.userId)!;
    return { ...toDuesRecord(d), user: { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email } };
  });

  const statuses: DuesStatus[] = ["PAID", "PARTIAL", "UNPAID", "WAIVED"];
  const summary = statuses.map((status) => {
    const rows = list.filter((d) => d.status === status);
    return {
      status,
      _count: { _all: rows.length },
      _sum: {
        amountOwed: rows.reduce((s, r) => s + r.amountOwed, 0),
        amountPaid: rows.reduce((s, r) => s + r.amountPaid, 0),
      },
    };
  }).filter((s) => s._count._all > 0);

  return { records, summary };
}

function recalcDuesStatus(record: db.MockDuesRecord): void {
  if (record.status === "WAIVED") return;
  if (record.amountPaid <= 0) record.status = "UNPAID";
  else if (record.amountPaid >= record.amountOwed) record.status = "PAID";
  else record.status = "PARTIAL";
}

export function recordPayment(
  userId: string,
  payload: { semesterId: string; amount: number; method: PaymentMethod; note?: string }
): { payment: Payment; duesRecord: DuesRecord } {
  if (!can(getCurrentDemoUserId(), "dues.manage")) throw new DemoApiError(403, "Not authorized to record payments");
  const record = db.findDuesRecord(userId, payload.semesterId);
  if (!record) throw new DemoApiError(404, "Dues record not found");

  const payment: db.MockPayment = {
    id: db.nextId("pay"),
    duesRecordId: record.id,
    amount: payload.amount,
    method: payload.method,
    externalRef: payload.note ?? null,
    paidAt: new Date().toISOString(),
    recordedById: getCurrentDemoUserId(),
  };
  db.payments.push(payment);
  record.amountPaid += payload.amount;
  recalcDuesStatus(record);

  return { payment: toPayment(payment), duesRecord: toDuesRecord(record) };
}

// Self-service Pyli payment (Feature 4) — Pyli is the chapter's external
// payment provider; this is intentionally NOT a real payment integration
// (no SDK, no card entry, no webhook). It's a thin, honest stand-in: the
// member picks Full or Monthly, the screen shows a brief "processing"
// state, and the payment posts here exactly like an officer-recorded one
// would, just self-initiated and with method="PYLI". No officer approval
// needed — this mirrors a real Pyli checkout completing instantly from the
// chapter's point of view.
export function payDuesWithPyli(payload: {
  semesterId: string;
  amount: number;
  plan: DuesPlan;
}): { payment: Payment; duesRecord: DuesRecord } {
  const userId = getCurrentDemoUserId();
  if (payload.amount <= 0) throw new DemoApiError(400, "Enter an amount greater than zero");
  const record = db.findDuesRecord(userId, payload.semesterId);
  if (!record) throw new DemoApiError(404, "Dues record not found");
  if (record.status === "WAIVED") throw new DemoApiError(400, "Dues have already been waived");

  const payment: db.MockPayment = {
    id: db.nextId("pay"),
    duesRecordId: record.id,
    amount: payload.amount,
    method: "PYLI",
    externalRef: `pyli_${db.nextId("txn")}`,
    paidAt: new Date().toISOString(),
    recordedById: null,
  };
  db.payments.push(payment);
  record.amountPaid += payload.amount;
  record.plan = payload.plan;
  recalcDuesStatus(record);

  return { payment: toPayment(payment), duesRecord: toDuesRecord(record) };
}

export function waiveDues(userId: string, semesterId: string, reason: string): DuesRecord {
  if (!can(getCurrentDemoUserId(), "dues.manage")) throw new DemoApiError(403, "Not authorized to waive dues");
  const record = db.findDuesRecord(userId, semesterId);
  if (!record) throw new DemoApiError(404, "Dues record not found");
  record.status = "WAIVED";
  return toDuesRecord(record);
}

export function initializeSemesterDues(payload: {
  semesterId: string;
  amountOwed: number;
  dueDate?: string;
  userIds?: string[];
}): { created: number; total: number } {
  if (!can(getCurrentDemoUserId(), "dues.manage")) throw new DemoApiError(403, "Not authorized to initialize dues");
  const targets = payload.userIds?.length
    ? payload.userIds
    : db.users.filter((u) => u.status === "ACTIVE" || u.status === "PNM").map((u) => u.id);

  let created = 0;
  for (const userId of targets) {
    if (db.findDuesRecord(userId, payload.semesterId)) continue;
    db.duesRecords.push({
      id: db.nextId("dues"),
      userId,
      semesterId: payload.semesterId,
      amountOwed: payload.amountOwed,
      amountPaid: 0,
      status: "UNPAID",
      dueDate: payload.dueDate ?? null,
    });
    created += 1;
  }
  return { created, total: targets.length };
}

export function sendDuesReminders(semesterId: string): {
  sent: number;
  members: { userId: string; firstName: string; email: string; status: string }[];
} {
  if (!can(getCurrentDemoUserId(), "dues.manage")) throw new DemoApiError(403, "Not authorized to send dues reminders");
  const outstanding = db.duesRecords.filter(
    (d) => d.semesterId === semesterId && (d.status === "UNPAID" || d.status === "PARTIAL")
  );
  const members = outstanding.map((d) => {
    const u = db.findUser(d.userId)!;
    return { userId: u.id, firstName: u.firstName, email: u.email, status: d.status };
  });
  return { sent: members.length, members };
}

// ── Committee Budgets & Reimbursements ──────────────────────────────────
// Tracking only (Feature 5) — see types/index.ts CommitteeBudget/Expense
// doc comments for the "no real money moves" note. `spent`/`pending` are
// always derived from expense status, never stored, so they can't drift.

function toCommitteeBudget(committeeId: string): CommitteeBudget {
  const committee = db.committees.find((c) => c.id === committeeId);
  const budget = db.findCommitteeBudget(committeeId, db.semester.id);
  const committeeExpenses = db.expenses.filter((e) => e.committeeId === committeeId);
  const spent = committeeExpenses.filter((e) => e.status === "REIMBURSED").reduce((s, e) => s + e.amount, 0);
  const pending = committeeExpenses
    .filter((e) => e.status === "SUBMITTED" || e.status === "APPROVED")
    .reduce((s, e) => s + e.amount, 0);
  const allocated = budget?.allocated ?? 0;
  return {
    committeeId,
    committeeName: committee?.name ?? "",
    semesterId: db.semester.id,
    allocated,
    spent,
    pending,
    remaining: allocated - spent - pending,
  };
}

export function listCommitteeBudgets(): CommitteeBudget[] {
  if (!isTreasurerOrAdmin(getCurrentDemoUserId())) throw new DemoApiError(403, "Treasurer required");
  return db.committees.map((c) => toCommitteeBudget(c.id));
}

// Broader read access than listCommitteeBudgets — a committee chair needs
// to see their own remaining budget before submitting an expense.
export function getCommitteeBudget(committeeId: string): CommitteeBudget {
  const userId = getCurrentDemoUserId();
  if (!isTreasurerOrAdmin(userId) && !isExecOrAbove(userId) && !committeeChairOf(userId).includes(committeeId)) {
    throw new DemoApiError(403, "Not authorized to view this committee's budget");
  }
  if (!db.committees.some((c) => c.id === committeeId)) throw new DemoApiError(404, "Committee not found");
  return toCommitteeBudget(committeeId);
}

export function setCommitteeBudget(committeeId: string, payload: { allocated: number }): CommitteeBudget {
  if (!isTreasurerOrAdmin(getCurrentDemoUserId())) throw new DemoApiError(403, "Treasurer required");
  if (!db.committees.some((c) => c.id === committeeId)) throw new DemoApiError(404, "Committee not found");
  const existing = db.findCommitteeBudget(committeeId, db.semester.id);
  if (existing) existing.allocated = payload.allocated;
  else db.committeeBudgets.push({ committeeId, semesterId: db.semester.id, allocated: payload.allocated });
  return toCommitteeBudget(committeeId);
}

function toExpense(e: db.MockExpense): Expense {
  const committee = db.committees.find((c) => c.id === e.committeeId);
  const submittedBy = db.findUser(e.submittedById)!;
  const reviewedBy = e.reviewedById ? db.findUser(e.reviewedById) : null;
  return {
    id: e.id,
    committeeId: e.committeeId,
    committeeName: committee?.name ?? "",
    submittedBy: { id: submittedBy.id, firstName: submittedBy.firstName, lastName: submittedBy.lastName },
    amount: e.amount,
    description: e.description,
    date: e.date,
    receiptLabel: e.receiptLabel ?? null,
    status: e.status,
    reimbursementMethod: e.reimbursementMethod ?? null,
    reimbursementNote: e.reimbursementNote ?? null,
    reviewedBy: reviewedBy ? { firstName: reviewedBy.firstName, lastName: reviewedBy.lastName } : null,
    createdAt: e.createdAt,
  };
}

export function listExpenses(params: { committeeId?: string; status?: string }): Expense[] {
  const userId = getCurrentDemoUserId();
  let list = db.expenses.slice();
  if (params.committeeId) list = list.filter((e) => e.committeeId === params.committeeId);
  if (params.status) list = list.filter((e) => e.status === params.status);

  // Treasurer/Exec see every committee's expenses; a committee chair sees
  // only their own committee's — same "own scope only" pattern as
  // canManageEvent for non-Exec officers.
  if (!isTreasurerOrAdmin(userId) && !isExecOrAbove(userId)) {
    const chairOf = new Set(committeeChairOf(userId));
    list = list.filter((e) => chairOf.has(e.committeeId));
  }

  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toExpense);
}

export function submitExpense(payload: {
  committeeId: string;
  amount: number;
  description: string;
  date: string;
  receiptLabel?: string;
}): Expense {
  const userId = getCurrentDemoUserId();
  if (!isExecOrAbove(userId) && !committeeChairOf(userId).includes(payload.committeeId)) {
    throw new DemoApiError(403, "Only this committee's chair can submit an expense against its budget");
  }
  if (!db.committees.some((c) => c.id === payload.committeeId)) throw new DemoApiError(404, "Committee not found");
  if (payload.amount <= 0) throw new DemoApiError(400, "Amount must be greater than zero");
  if (!payload.description.trim()) throw new DemoApiError(400, "Description is required");

  const expense: db.MockExpense = {
    id: db.nextId("exp"),
    committeeId: payload.committeeId,
    submittedById: userId,
    amount: payload.amount,
    description: payload.description.trim(),
    date: payload.date,
    receiptLabel: payload.receiptLabel ?? null,
    status: "SUBMITTED",
    createdAt: new Date().toISOString(),
  };
  db.expenses.push(expense);
  return toExpense(expense);
}

export function updateExpenseStatus(
  expenseId: string,
  payload: { status: ReimbursementStatus; reimbursementMethod?: PaymentMethod; reimbursementNote?: string }
): Expense {
  if (!isTreasurerOrAdmin(getCurrentDemoUserId())) throw new DemoApiError(403, "Treasurer required");
  const expense = db.findExpense(expenseId);
  if (!expense) throw new DemoApiError(404, "Expense not found");

  expense.status = payload.status;
  if (payload.reimbursementMethod) expense.reimbursementMethod = payload.reimbursementMethod;
  if (payload.reimbursementNote !== undefined) expense.reimbursementNote = payload.reimbursementNote;
  expense.reviewedById = getCurrentDemoUserId();

  return toExpense(expense);
}

// ── Role Permissions (spec §3) ──────────────────────────────────────────
// "Roles should simply be permission presets" — this is the mutable
// preset editor's backing API. Reads are unrestricted (every client needs
// the current map to gate its own UI correctly, regardless of the current
// user's role — this is metadata, not sensitive data); only writes require
// permissions.manage. SUPER_ADMIN is never editable (it always bypasses,
// see permissions/permissions.ts hasPermission()), so it's omitted from
// both the read and write surface.

export function getRolePermissions(): RolePermissions[] {
  return (Object.keys(db.rolePermissions) as UserRole[])
    .filter((role) => role !== "SUPER_ADMIN")
    .map((role) => ({ role, permissions: db.rolePermissions[role] }));
}

export function updateRolePermissions(role: UserRole, permissions: Permission[]): RolePermissions {
  if (!can(getCurrentDemoUserId(), "permissions.manage")) {
    throw new DemoApiError(403, "Not authorized to modify role permissions");
  }
  if (role === "SUPER_ADMIN") throw new DemoApiError(400, "Super Admin permissions can't be edited — always unrestricted");
  db.rolePermissions[role] = permissions;
  return { role, permissions };
}

// ── Modules (spec §5) ────────────────────────────────────────────────────

export function getModules(): ModuleConfig[] {
  return db.moduleConfigs.slice();
}

export function setModuleEnabled(key: ModuleKey, enabled: boolean): ModuleConfig {
  if (!can(getCurrentDemoUserId(), "modules.manage")) {
    throw new DemoApiError(403, "Not authorized to enable/disable modules");
  }
  const mod = db.findModule(key);
  if (!mod) throw new DemoApiError(404, "Module not found");
  mod.enabled = enabled;
  return mod;
}

// ── Chapter Settings (spec §6) ───────────────────────────────────────────

export function getChapterSettings(): ChapterSettings {
  return { ...db.chapterSettings };
}

export function updateChapterSettings(payload: Partial<ChapterSettings>): ChapterSettings {
  if (!can(getCurrentDemoUserId(), "settings.manage")) {
    throw new DemoApiError(403, "Not authorized to edit chapter settings");
  }
  Object.assign(db.chapterSettings, payload);
  return { ...db.chapterSettings };
}

// ── Documents & external links (spec §8) ────────────────────────────────

export function listDocuments(params: { category?: DocumentCategory }): ChapterDocument[] {
  let list = db.documents.slice();
  if (params.category) list = list.filter((d) => d.category === params.category);
  return list.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function uploadDocument(payload: {
  category: DocumentCategory;
  name: string;
  fileLabel: string;
}): ChapterDocument {
  if (!can(getCurrentDemoUserId(), "documents.upload")) {
    throw new DemoApiError(403, "Not authorized to upload documents");
  }
  const user = getCurrentDemoUser();
  const doc: ChapterDocument = {
    id: db.nextDocumentId(),
    category: payload.category,
    name: payload.name,
    fileLabel: payload.fileLabel,
    sizeLabel: null,
    uploadedBy: { id: user.id, firstName: user.firstName, lastName: user.lastName },
    uploadedAt: new Date().toISOString(),
  };
  db.documents.push(doc);
  return doc;
}

export function deleteDocument(id: string): void {
  if (!can(getCurrentDemoUserId(), "documents.delete")) {
    throw new DemoApiError(403, "Not authorized to delete documents");
  }
  const idx = db.documents.findIndex((d) => d.id === id);
  if (idx < 0) throw new DemoApiError(404, "Document not found");
  db.documents.splice(idx, 1);
}

export function listExternalLinks(): ExternalLink[] {
  return db.externalLinks.slice();
}

export function createExternalLink(payload: { label: string; url: string; category?: string }): ExternalLink {
  if (!can(getCurrentDemoUserId(), "documents.upload")) {
    throw new DemoApiError(403, "Not authorized to add links");
  }
  const link: ExternalLink = {
    id: db.nextExternalLinkId(),
    label: payload.label,
    url: payload.url,
    category: payload.category ?? null,
  };
  db.externalLinks.push(link);
  return link;
}

export function deleteExternalLink(id: string): void {
  if (!can(getCurrentDemoUserId(), "documents.delete")) {
    throw new DemoApiError(403, "Not authorized to remove links");
  }
  const idx = db.externalLinks.findIndex((l) => l.id === id);
  if (idx < 0) throw new DemoApiError(404, "Link not found");
  db.externalLinks.splice(idx, 1);
}

// ── Feedback & bug reports (spec §9) ─────────────────────────────────────

export function submitFeedback(payload: {
  type: FeedbackType;
  message: string;
  appVersion: string;
  platform: string;
}): FeedbackReport {
  if (!payload.message.trim()) throw new DemoApiError(400, "Message is required");
  const user = getCurrentDemoUser();
  const report: FeedbackReport = {
    id: db.nextFeedbackId(),
    type: payload.type,
    message: payload.message.trim(),
    submittedBy: { id: user.id, firstName: user.firstName, lastName: user.lastName },
    appVersion: payload.appVersion,
    platform: payload.platform,
    status: "OPEN",
    createdAt: new Date().toISOString(),
  };
  db.feedbackReports.push(report);
  return report;
}

export function listFeedback(params: { type?: FeedbackType; status?: FeedbackStatus }): FeedbackReport[] {
  if (!can(getCurrentDemoUserId(), "feedback.view")) {
    throw new DemoApiError(403, "Not authorized to view feedback submissions");
  }
  let list = db.feedbackReports.slice();
  if (params.type) list = list.filter((f) => f.type === params.type);
  if (params.status) list = list.filter((f) => f.status === params.status);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateFeedbackStatus(id: string, status: FeedbackStatus): FeedbackReport {
  if (!can(getCurrentDemoUserId(), "feedback.manage")) {
    throw new DemoApiError(403, "Not authorized to update feedback status");
  }
  const report = db.findFeedback(id);
  if (!report) throw new DemoApiError(404, "Feedback report not found");
  report.status = status;
  return report;
}
