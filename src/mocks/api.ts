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
  ChapterBranding,
  ChapterDocument,
  DocumentCategory,
  DocumentFolder,
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
  return hasPermission(u.role, db.rolePermissions, permission, u.office, db.officePermissions);
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
  // Mirrors requireCommitteeScope on the real POST /events: Exec+ (i.e.
  // events.create, the role-tier permission) can create anything; anyone
  // else needs the event scoped to a specific committee they chair. This
  // had no check at all before — any demo user, including a PNM, could
  // create any event for any committee.
  if (!can(userId, "events.create")) {
    if (!payload.committeeId || !committeeManageAccess(userId, payload.committeeId)) {
      throw new DemoApiError(403, "Not permitted");
    }
  }
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
    // MockUser predates username (added with the real account system) —
    // derived from email rather than touching every seeded user record.
    username: u.email.split("@")[0],
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    avatarUrl: u.avatarUrl ?? null,
    role: u.role,
    office: u.office ?? null,
    status: u.status,
    roleNumber: u.roleNumber ?? null,
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
    username: u.email.split("@")[0],
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone ?? null,
    avatarUrl: u.avatarUrl ?? null,
    // Demo Mode doesn't model Chapter/ChapterMembership as separate tables
    // (see docs/DEMO_MODE.md) — every seeded user is already "in the
    // chapter," so this is always true here.
    hasChapter: true,
    role: u.role,
    office: u.office ?? null,
    status: u.status,
    roleNumber: u.roleNumber ?? null,
    pledgeClassLabel: u.pledgeClassLabel ?? null,
    major: u.major ?? null,
    graduationYear: u.graduationYear ?? null,
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
function userPointsBreakdown(userId: string, semesterId: string): PointsBreakdown {
  const entries = db.ledgerEntries.filter((l) => l.userId === userId && l.semesterId === semesterId);
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

function leaderboardRows(semesterId: string): LeaderboardEntry[] {
  const userId = getCurrentDemoUserId();
  const scored = db.users
    .filter((u) => u.status === "ACTIVE" || u.status === "PNM")
    .map((u) => ({ u, breakdown: userPointsBreakdown(u.id, semesterId) }))
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
  const board = leaderboardRows(db.semester.id);
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

/** Name-only counterpart to getRoster — no email, no role/status, and never
 * includes the caller (mirrors backend/routes/users.routes.ts GET
 * /users/search, which any chapter member can call, unlike getRoster). */
export function searchMembers(q: string): { id: string; firstName: string; lastName: string; avatarUrl: string | null }[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const selfId = getCurrentDemoUserId();
  return db.users
    .filter(
      (u) =>
        u.id !== selfId &&
        (u.firstName.toLowerCase().includes(query) || u.lastName.toLowerCase().includes(query))
    )
    .slice(0, 15)
    .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, avatarUrl: u.avatarUrl ?? null }));
}

export function getMemberProfile(userId: string): User {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");
  return toFullUser(u);
}

// Mirrors backend/routes/users.routes.ts syncedStatus() — PNM/ALUMNI are
// lifecycle stages in their own right, so setting either role forces the
// matching status; Member/Exec only promote OUT of PNM/ALUMNI into ACTIVE
// and never touch an existing ACTIVE/INACTIVE status. Without this, changing
// a PNM's role to Member left status="PNM" behind — the roster would show a
// Member who was simultaneously still a PNM.
function syncedStatus(newRole: UserRole, currentStatus: MemberStatus): MemberStatus {
  if (newRole === "PNM") return "PNM";
  if (newRole === "ALUMNI") return "ALUMNI";
  if (newRole === "SUPER_ADMIN") return currentStatus;
  return currentStatus === "PNM" || currentStatus === "ALUMNI" ? "ACTIVE" : currentStatus;
}

export function updateUserRole(userId: string, role: UserRole): User {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");
  if (!can(getCurrentDemoUserId(), "users.manage")) {
    throw new DemoApiError(403, "Not authorized to change member roles");
  }
  u.role = role;
  u.status = syncedStatus(role, u.status);
  return toFullUser(u);
}

// Mirrors backend/routes/users.routes.ts DELETE /users/:id — same
// authorization as updateUserRole, self-delete blocked the same way (use
// "Delete my account" in Settings for that — deleteMyAccount() is handled
// entirely client-side in Demo Mode, see SettingsHomePage.tsx, so there's
// no mock counterpart to register for it). There's no deletedAt concept in
// this mock world (usernames aren't even stored — see toUserSummary), so
// this just removes the record outright rather than soft-deleting it; a
// demo session resets on reload anyway, so there's nothing to actually
// reconcile long-term the way the real backend has to.
export function deleteMemberAccount(userId: string): { deleted: true } {
  if (!can(getCurrentDemoUserId(), "users.manage")) {
    throw new DemoApiError(403, "Not authorized to delete accounts");
  }
  if (userId === getCurrentDemoUserId()) {
    throw new DemoApiError(400, 'Use "Delete my account" in Settings to delete your own account.');
  }
  const index = db.users.findIndex((u) => u.id === userId);
  if (index === -1) throw new DemoApiError(404, "User not found");
  db.users.splice(index, 1);
  return { deleted: true };
}

// Fuller editor (spec §4 — Super Admin: manage users, assign roles, assign
// exec offices). Same authorization as updateUserRole; office/status are
// independent fields (see types/index.ts doc comment) so each is optional
// and only touched when present in the payload.
export function updateUserFields(
  userId: string,
  payload: {
    role?: UserRole;
    office?: ExecOffice | null;
    status?: MemberStatus;
    pledgeClassLabel?: string | null;
    major?: string | null;
    graduationYear?: number | null;
  }
): User {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");
  if (!can(getCurrentDemoUserId(), "users.manage")) {
    throw new DemoApiError(403, "Not authorized to edit member roles/status");
  }
  if (payload.role !== undefined) u.role = payload.role;
  if (payload.office !== undefined) u.office = payload.office;
  if (payload.status !== undefined) u.status = payload.status;
  if (payload.pledgeClassLabel !== undefined) u.pledgeClassLabel = payload.pledgeClassLabel;
  if (payload.major !== undefined) u.major = payload.major;
  if (payload.graduationYear !== undefined) u.graduationYear = payload.graduationYear;
  return toFullUser(u);
}

// ── Family (Big/Little) & Role Numbers (account-system spec §6/§7) ───────

function toFamilyMemberSummary(u: db.MockUser) {
  return {
    userId: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl ?? null,
    roleNumber: u.roleNumber ?? null,
  };
}

export function getFamily(userId: string): { big: ReturnType<typeof toFamilyMemberSummary> | null; littles: ReturnType<typeof toFamilyMemberSummary>[] } {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");
  const big = u.bigId ? db.findUser(u.bigId) : undefined;
  const littles = db.users.filter((m) => m.bigId === userId);
  return {
    big: big ? toFamilyMemberSummary(big) : null,
    littles: littles.map(toFamilyMemberSummary),
  };
}

// Mirrors backend/routes/membership.routes.ts PATCH /users/:id/big — anyone
// can now manage their OWN Big/Little relationships, not just Exec+/
// manageRelationships. A PNM can add/remove their own Big, but can't take on
// Littles (add or release); everyone else can do both, for themselves.
// Rearranging two OTHER people's relationships is still admin-only.
export function setBig(userId: string, bigUserId: string | null): User {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");

  const caller = getCurrentDemoUserId();
  const hasAdminPermission = can(caller, "membership.manageRelationships");
  const callerUser = db.findUser(caller);
  const isEditingOwnBig = userId === caller;
  const isClaimingAsMyLittle = bigUserId === caller;
  const isReleasingMyLittle = bigUserId === null && u.bigId === caller;
  const canManageAsSelf =
    isEditingOwnBig ||
    ((isClaimingAsMyLittle || isReleasingMyLittle) && callerUser?.role !== "PNM");

  if (!hasAdminPermission && !canManageAsSelf) {
    throw new DemoApiError(403, "Not authorized to assign Big/Little");
  }

  if (bigUserId === null) {
    u.bigId = null;
    return toFullUser(u);
  }
  const big = db.findUser(bigUserId);
  if (!big) throw new DemoApiError(404, "Proposed Big not found");
  if (big.id === u.id) throw new DemoApiError(400, "A member can't be their own Big");

  // Same cycle guard as the real backend (membership.routes.ts) — walk the
  // proposed Big's own lineage for the target, bounded so a corrupt chain
  // can't loop forever.
  let cursor: string | null | undefined = big.bigId;
  for (let hops = 0; cursor && hops < 50; hops++) {
    if (cursor === u.id) throw new DemoApiError(400, "That assignment would create a Big/Little cycle");
    cursor = db.findUser(cursor)?.bigId;
  }

  u.bigId = big.id;
  return toFullUser(u);
}

export function setRoleNumber(userId: string, roleNumber: number | null): User {
  const u = db.findUser(userId);
  if (!u) throw new DemoApiError(404, "User not found");
  if (!can(getCurrentDemoUserId(), "membership.assignRoleNumber")) {
    throw new DemoApiError(403, "Not authorized to assign role numbers");
  }
  if (roleNumber !== null && u.status === "PNM") {
    throw new DemoApiError(400, "PNMs can't be assigned a role number until they're initiated — update status first");
  }
  if (roleNumber !== null && db.users.some((m) => m.id !== userId && m.roleNumber === roleNumber)) {
    throw new DemoApiError(409, "That role number is already in use in this chapter");
  }
  u.roleNumber = roleNumber;
  return toFullUser(u);
}

export function updateMyProfile(payload: {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  major?: string | null;
  graduationYear?: number | null;
}): User {
  const u = db.findUser(getCurrentDemoUserId());
  if (!u) throw new DemoApiError(404, "User not found");
  if (payload.firstName !== undefined) u.firstName = payload.firstName;
  if (payload.lastName !== undefined) u.lastName = payload.lastName;
  if (payload.phone !== undefined) u.phone = payload.phone ?? undefined;
  if (payload.avatarUrl !== undefined) u.avatarUrl = payload.avatarUrl;
  if (payload.major !== undefined) u.major = payload.major;
  if (payload.graduationYear !== undefined) u.graduationYear = payload.graduationYear;
  return toFullUser(u);
}

// ── Chapters, invites & join requests (account-system spec §3) ───────────
// Demo Mode only models one chapter (see docs/DEMO_MODE.md) — enough to
// demonstrate ChapterInviteManagerScreen/JoinRequestsScreen, reachable from
// AdminPanelScreen for any Exec+ demo user.

export function listChapters(): { id: string; name: string; letters: string | null; university: string | null; logoUrl: string | null }[] {
  return [{
    id: db.DEMO_CHAPTER_ID,
    name: db.chapterSettings.chapterName,
    letters: db.chapterSettings.chapterLetters,
    university: db.chapterSettings.university,
    logoUrl: db.chapterSettings.logoUrl ?? null,
  }];
}

function requireChapterInviteAccess(): void {
  if (!can(getCurrentDemoUserId(), "chapters.manageInvites")) {
    throw new DemoApiError(403, "Not authorized to manage chapter invites");
  }
}

/**
 * Human-friendly random code: no vowels (can't accidentally spell anything),
 * no 0/O/1/I/L (can't be misread off a projector at an info night).
 */
const CODE_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";

function generateInviteCode(length = 8): string {
  let code = "";
  do {
    code = Array.from(
      { length },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    ).join("");
  } while (db.findInviteByCode(code)); // collision guard, same as the server would
  return code;
}

type InvitePayload = {
  code?: string;
  label?: string | null;
  role?: UserRole;
  status?: MemberStatus;
  maxUses?: number | null;
  expiresAt?: string | null;
  active?: boolean;
};

/**
 * Shared validation for create and update. Mirrors what the real route's zod
 * schema would reject, so screens get the same error messages in both modes
 * and a bug in the form surfaces in Demo Mode instead of only in production.
 */
function validateInvitePayload(payload: InvitePayload, existing?: db.MockChapterInvite): void {
  if (payload.code !== undefined) {
    const code = payload.code.trim().toUpperCase();
    if (code.length < 4 || code.length > 24) {
      throw new DemoApiError(400, "Code must be between 4 and 24 characters.");
    }
    if (!/^[A-Z0-9-]+$/.test(code)) {
      throw new DemoApiError(400, "Code can only contain letters, numbers, and dashes.");
    }
    const clash = db.findInviteByCode(code);
    if (clash && clash.id !== existing?.id) {
      throw new DemoApiError(409, `Code "${code}" is already in use.`);
    }
  }
  if (payload.maxUses != null) {
    if (!Number.isInteger(payload.maxUses) || payload.maxUses < 1) {
      throw new DemoApiError(400, "Max uses must be a whole number of 1 or more.");
    }
    const used = existing?.useCount ?? 0;
    if (payload.maxUses < used) {
      throw new DemoApiError(400, `This code has already been used ${used} times — max uses can't be lower.`);
    }
  }
  if (payload.expiresAt) {
    const when = new Date(payload.expiresAt);
    if (Number.isNaN(when.getTime())) {
      throw new DemoApiError(400, "Expiration date is not valid.");
    }
  }
}

function findInviteOr404(inviteId: string): db.MockChapterInvite {
  const invite = db.chapterInvites.find((i) => i.id === inviteId);
  if (!invite) throw new DemoApiError(404, "Invite not found");
  return invite;
}

export function createInvite(_chapterId: string, payload: InvitePayload): db.MockChapterInvite {
  requireChapterInviteAccess();
  validateInvitePayload(payload);
  const invite: db.MockChapterInvite = {
    id: db.nextInviteId(),
    chapterId: db.DEMO_CHAPTER_ID,
    code: payload.code ? payload.code.trim().toUpperCase() : generateInviteCode(),
    label: payload.label?.trim() || null,
    role: payload.role ?? "MEMBER",
    status: payload.status ?? "PNM",
    maxUses: payload.maxUses ?? null,
    useCount: 0,
    expiresAt: payload.expiresAt ?? null,
    active: payload.active ?? true,
    revokedAt: null,
    regeneratedAt: null,
    lastUsedAt: null,
    createdById: getCurrentDemoUserId(),
    createdAt: new Date().toISOString(),
  };
  db.chapterInvites.push(invite);
  return invite;
}

export function getInvites(_chapterId: string): db.MockChapterInvite[] {
  requireChapterInviteAccess();
  return db.chapterInvites.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateInvite(
  _chapterId: string,
  inviteId: string,
  payload: InvitePayload
): db.MockChapterInvite {
  requireChapterInviteAccess();
  const invite = findInviteOr404(inviteId);
  if (invite.revokedAt) {
    throw new DemoApiError(409, "Archived invites can't be edited. Restore it first.");
  }
  validateInvitePayload(payload, invite);

  if (payload.code !== undefined) invite.code = payload.code.trim().toUpperCase();
  if (payload.label !== undefined) invite.label = payload.label?.trim() || null;
  if (payload.role !== undefined) invite.role = payload.role;
  if (payload.status !== undefined) invite.status = payload.status;
  if (payload.maxUses !== undefined) invite.maxUses = payload.maxUses;
  if (payload.expiresAt !== undefined) invite.expiresAt = payload.expiresAt;
  if (payload.active !== undefined) invite.active = payload.active;
  return invite;
}

/**
 * Archive (the backend column is `revokedAt`). Kept as DELETE
 * /chapters/:id/invites/:inviteId for wire compatibility with the existing
 * backend route and the older revokeInvite() client function.
 */
export function revokeInvite(_chapterId: string, inviteId: string): db.MockChapterInvite {
  requireChapterInviteAccess();
  const invite = findInviteOr404(inviteId);
  invite.revokedAt = new Date().toISOString();
  return invite;
}

export function restoreInvite(_chapterId: string, inviteId: string): db.MockChapterInvite {
  requireChapterInviteAccess();
  const invite = findInviteOr404(inviteId);
  invite.revokedAt = null;
  return invite;
}

/**
 * Issue a brand-new code string for an existing invite. The old string stops
 * working immediately — anyone holding a printed flyer or an old link is cut
 * off, which is the entire point (and what the UI warns about before calling
 * this). Configuration and use count are deliberately preserved.
 */
export function regenerateInvite(_chapterId: string, inviteId: string): db.MockChapterInvite {
  requireChapterInviteAccess();
  const invite = findInviteOr404(inviteId);
  if (invite.revokedAt) {
    throw new DemoApiError(409, "Archived invites can't be regenerated. Restore it first.");
  }
  invite.code = generateInviteCode();
  invite.regeneratedAt = new Date().toISOString();
  return invite;
}

// ── Roster verification entries ───────────────────────────────────────────
// Same access gate as the invite manager — see requireChapterInviteAccess()
// above.

type RosterEntryPayload = {
  firstName: string;
  lastName: string;
  roleNumber: number;
  status: "ACTIVE" | "ALUMNI";
};

function validateRosterEntryPayload(payload: RosterEntryPayload, chapterId: string, existingId?: string): void {
  if (!payload.firstName?.trim() || !payload.lastName?.trim()) {
    throw new DemoApiError(400, "First and last name are required.");
  }
  if (!Number.isInteger(payload.roleNumber) || payload.roleNumber <= 0) {
    throw new DemoApiError(400, "Role number must be a whole number greater than 0.");
  }
  const clash = db.chapterRosterEntries.find(
    (e) => e.chapterId === chapterId && e.roleNumber === payload.roleNumber && e.id !== existingId
  );
  if (clash) throw new DemoApiError(409, `Role number ${payload.roleNumber} is already on the roster.`);
}

export function getRosterEntries(chapterId: string): db.MockChapterRosterEntry[] {
  requireChapterInviteAccess();
  return db.chapterRosterEntries
    .filter((e) => e.chapterId === chapterId)
    .slice()
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export function createRosterEntry(chapterId: string, payload: RosterEntryPayload): db.MockChapterRosterEntry {
  requireChapterInviteAccess();
  validateRosterEntryPayload(payload, chapterId);
  const entry: db.MockChapterRosterEntry = {
    id: db.nextRosterEntryId(),
    chapterId,
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    roleNumber: payload.roleNumber,
    status: payload.status,
    claimedByUserId: null,
    createdAt: new Date().toISOString(),
  };
  db.chapterRosterEntries.push(entry);
  return entry;
}

export function bulkCreateRosterEntries(
  chapterId: string,
  entries: RosterEntryPayload[]
): { created: db.MockChapterRosterEntry[]; errors: { index: number; error: string }[] } {
  requireChapterInviteAccess();
  const created: db.MockChapterRosterEntry[] = [];
  const errors: { index: number; error: string }[] = [];
  entries.forEach((payload, index) => {
    try {
      created.push(createRosterEntry(chapterId, payload));
    } catch (e) {
      errors.push({ index, error: e instanceof DemoApiError ? e.message : "Couldn't add this row." });
    }
  });
  return { created, errors };
}

export function deleteRosterEntry(chapterId: string, entryId: string): void {
  requireChapterInviteAccess();
  const index = db.chapterRosterEntries.findIndex((e) => e.id === entryId && e.chapterId === chapterId);
  if (index === -1) throw new DemoApiError(404, "Roster entry not found");
  if (db.chapterRosterEntries[index].claimedByUserId) {
    throw new DemoApiError(400, "This entry has already been claimed by a signup and is now part of that record — it can't be deleted.");
  }
  db.chapterRosterEntries.splice(index, 1);
}

// ── Chapter branding ─────────────────────────────────────────────────────
// Backed by the same single mutable record the rest of the demo uses, so an
// admin's edit is immediately visible to every screen for the session — the
// same behavior a real PATCH + refetch would produce.

const DEFAULT_DEMO_BRANDING: ChapterBranding = { ...db.chapterBranding };

function requireBrandingAccess(): void {
  if (!can(getCurrentDemoUserId(), "settings.manage")) {
    throw new DemoApiError(403, "Not authorized to change chapter branding");
  }
}

export function getChapterBranding(_chapterId: string): ChapterBranding {
  // Readable by every member — branding is what the whole app is painted
  // with, so gating the GET would leave non-admins on the default palette.
  return { ...db.chapterBranding };
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function updateChapterBranding(
  _chapterId: string,
  payload: Partial<ChapterBranding>
): ChapterBranding {
  requireBrandingAccess();

  for (const key of ["primaryColor", "accentColor", "backgroundTintLight", "backgroundTintDark"] as const) {
    const value = payload[key];
    if (value != null && !HEX_RE.test(String(value))) {
      throw new DemoApiError(400, `${key} must be a hex color like #1B2A4A.`);
    }
  }
  if (payload.chapterName !== undefined && !payload.chapterName.trim()) {
    throw new DemoApiError(400, "Chapter name can't be empty.");
  }

  const { chapterId: _ignored, updatedAt: _ignoredAt, ...assignable } = payload;
  Object.assign(db.chapterBranding, assignable);
  db.chapterBranding.updatedAt = new Date().toISOString();

  // Chapter name is shown in two places that read from different records —
  // keep the operational settings record in step so Chapter Settings and the
  // branding editor never disagree about the chapter's name.
  if (payload.chapterName !== undefined) db.chapterSettings.chapterName = payload.chapterName;
  if (payload.chapterLetters !== undefined) db.chapterSettings.chapterLetters = payload.chapterLetters;
  if (payload.logoUrl !== undefined) db.chapterSettings.logoUrl = payload.logoUrl;

  return { ...db.chapterBranding };
}

export function resetChapterBranding(_chapterId: string): ChapterBranding {
  requireBrandingAccess();
  Object.assign(db.chapterBranding, DEFAULT_DEMO_BRANDING, {
    updatedAt: new Date().toISOString(),
  });
  return { ...db.chapterBranding };
}

export function getJoinRequests(_chapterId: string, status: string): db.MockJoinRequest[] {
  requireChapterInviteAccess();
  return db.joinRequests.filter((r) => r.status === status);
}

export function reviewJoinRequest(joinRequestId: string, approve: boolean): db.MockJoinRequest {
  requireChapterInviteAccess();
  const request = db.joinRequests.find((r) => r.id === joinRequestId);
  if (!request) throw new DemoApiError(404, "Join request not found");
  request.status = approve ? "APPROVED" : "DENIED";
  return request;
}

/** Resolves a semesterId to its {id,label}, checking the current semester
 * first and then any closed-out ones — see seed.ts's pastSemesters. */
function resolveSemester(semesterId?: string): { id: string; label: string } {
  if (!semesterId || semesterId === db.semester.id) return { id: db.semester.id, label: db.semester.label };
  const past = db.pastSemesters.find((s) => s.id === semesterId);
  return past ? { id: past.id, label: past.label } : { id: db.semester.id, label: db.semester.label };
}

export function getLeaderboard(params: {
  semesterId?: string;
} = {}): { leaderboard: LeaderboardEntry[]; semesterId: string; semesterLabel: string | null } {
  const resolved = resolveSemester(params.semesterId);
  return { leaderboard: leaderboardRows(resolved.id), semesterId: resolved.id, semesterLabel: resolved.label };
}

export function listSemesters(): {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}[] {
  const all = [db.semester, ...db.pastSemesters];
  return all
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((s) => ({ ...s, isCurrent: s.id === db.semester.id }));
}

/** "Reset all points": closes out the current semester (archived into
 * pastSemesters, dates untouched — its ledger entries stay exactly as
 * they were) and makes the new one current. Mirrors the real
 * POST /semesters. */
export function createSemester(payload: { label: string; startDate: string; endDate: string }): {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
} {
  if (!can(getCurrentDemoUserId(), "semesters.manage")) {
    throw new DemoApiError(403, "Not authorized to start a new semester");
  }
  const label = payload.label.trim();
  if (!label) throw new DemoApiError(400, "Give the semester a label.");
  if (label.toLowerCase() === db.semester.label.toLowerCase() || db.pastSemesters.some((s) => s.label.toLowerCase() === label.toLowerCase())) {
    throw new DemoApiError(409, `A semester named "${label}" already exists.`);
  }
  db.setCurrentSemester({ id: db.nextId("sem"), label, startDate: payload.startDate, endDate: payload.endDate });
  return { ...db.semester, isCurrent: true };
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

export function getBrotherOfWeek(): { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null {
  if (!db.brotherOfWeekUserId) return null;
  const u = db.findUser(db.brotherOfWeekUserId);
  if (!u) return null;
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, avatarUrl: u.avatarUrl ?? null };
}

/** Awarding it to someone new clears the previous holder automatically —
 * reassigning the single holder field IS that removal, same as the real
 * Chapter.brotherOfWeekUserId FK. Open to Super Admin, Regent/Vice Regent
 * (brotherOfWeek.award), or the CURRENT holder passing the title on —
 * mirrors the real route's data-dependent check that a flat permission
 * can't express alone. */
export function awardBrotherOfWeek(userId: string) {
  const actorId = getCurrentDemoUserId();
  const isCurrentHolder = db.brotherOfWeekUserId === actorId;
  if (!can(actorId, "brotherOfWeek.award") && !isCurrentHolder) {
    throw new DemoApiError(403, "Only Super Admin, Regent/Vice Regent, or the current holder can award this.");
  }
  if (!db.findUser(userId)) throw new DemoApiError(404, "That person isn't in your chapter");
  db.setBrotherOfWeek(userId);
  return getBrotherOfWeek();
}

export function clearBrotherOfWeek(): void {
  const actorId = getCurrentDemoUserId();
  const isCurrentHolder = db.brotherOfWeekUserId === actorId;
  if (!can(actorId, "brotherOfWeek.award") && !isCurrentHolder) {
    throw new DemoApiError(403, "Only Super Admin, Regent/Vice Regent, or the current holder can clear this.");
  }
  db.setBrotherOfWeek(null);
}

const ATTENDANCE_REPORT_CATEGORIES = ["BROTHERHOOD", "SERVICE", "PROFESSIONAL", "RUSH", "ADMIN"] as const;

/** Mirrors the real GET /attendance/category-report — counts only, scoped
 * by event start time falling inside the semester's date range (not
 * PointsLedger, since a 0-point event still counts and never gets a
 * ledger entry — see the real route's doc comment). */
export function getAttendanceCategoryReport(semesterId?: string): {
  semesterLabel: string | null;
  categories: readonly string[];
  members: { userId: string; firstName: string; lastName: string; counts: Record<string, number> }[];
} {
  if (!can(getCurrentDemoUserId(), "attendance.viewReport")) {
    throw new DemoApiError(403, "Not authorized to view the attendance report");
  }
  const resolved = resolveSemester(semesterId);
  const semester = resolved.id === db.semester.id ? db.semester : db.pastSemesters.find((s) => s.id === resolved.id);
  const members = db.users.filter((u) => u.status === "ACTIVE" || u.status === "PNM");

  const counts = new Map<string, Record<string, number>>();
  for (const m of members) {
    counts.set(m.id, Object.fromEntries(ATTENDANCE_REPORT_CATEGORIES.map((c) => [c, 0])));
  }
  if (semester) {
    for (const a of db.attendances) {
      const row = counts.get(a.userId);
      const event = db.findEvent(a.eventId);
      if (!row || !event) continue;
      if (event.startTime < semester.startDate || event.startTime > semester.endDate) continue;
      row[event.category] = (row[event.category] ?? 0) + 1;
    }
  }

  return {
    semesterLabel: resolved.label,
    categories: ATTENDANCE_REPORT_CATEGORIES,
    members: members
      .slice()
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
      .map((m) => ({ userId: m.id, firstName: m.firstName, lastName: m.lastName, counts: counts.get(m.id)! })),
  };
}

const activeCheckInTokens = new Map<string, { eventId: string; expiresAt: number }>();

// Same alphabet as the real backend's short check-in code (chapters.routes.ts
// invite codes too) — visually unambiguous, since it's meant to be read off
// a screen and typed by hand.
const CHECKIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomCheckInCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CHECKIN_CODE_ALPHABET[Math.floor(Math.random() * CHECKIN_CODE_ALPHABET.length)];
  return code;
}

export function getCheckInToken(eventId: string): { token: string; code: string; expiresAt: number } {
  const event = db.findEvent(eventId);
  if (!event) throw new DemoApiError(404, "Event not found");
  if (!canAccessCheckIn(getCurrentDemoUserId(), event)) {
    throw new DemoApiError(403, "You don't have access to generate this event's check-in code");
  }
  const token = `demo-checkin:${eventId}:${db.nextId("tok")}`;
  const expiresAt = Date.now() + 60_000;
  activeCheckInTokens.set(token, { eventId, expiresAt });
  // Sticky, same reasoning as the real GET /events/:id/checkin-token: a
  // custom or previously-generated code shouldn't get silently replaced
  // every time this page polls for a fresh QR token.
  if (!event.checkInCode) event.checkInCode = randomCheckInCode();
  return { token, code: event.checkInCode, expiresAt };
}

/** Sets a custom code, or (omitted/blank) a fresh random one — mirrors the
 * real POST /events/:id/checkin-code. */
export function setCheckInCode(eventId: string, code?: string): { code: string } {
  const event = db.findEvent(eventId);
  if (!event) throw new DemoApiError(404, "Event not found");
  if (!canAccessCheckIn(getCurrentDemoUserId(), event)) {
    throw new DemoApiError(403, "You don't have access to set this event's check-in code");
  }
  const trimmed = code?.trim().toUpperCase();
  if (trimmed && !/^[A-Z0-9-]{4,12}$/.test(trimmed)) {
    throw new DemoApiError(400, "Code must be 4-12 characters: letters, numbers, and dashes.");
  }
  event.checkInCode = trimmed || randomCheckInCode();
  return { code: event.checkInCode };
}

export function selfCheckIn(
  eventId: string,
  credential: { token?: string; code?: string }
): { attendance: AttendanceRecord; alreadyCheckedIn?: boolean } {
  const userId = getCurrentDemoUserId();
  const event = db.findEvent(eventId);
  if (!event) throw new DemoApiError(404, "Event not found");

  const existing = db.findAttendance(eventId, userId);
  if (existing) {
    return { attendance: toAttendanceRecord(existing), alreadyCheckedIn: true };
  }

  // Demo mode is lenient about the scanned/typed payload — either a
  // non-empty token or a non-empty code checks you in, since testing a
  // real two-device QR handoff isn't possible for someone evaluating the
  // app solo. Real validation is the real backend's job.
  const submitted = credential.token?.trim() || credential.code?.trim();
  if (!submitted) {
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

// Mirrors DELETE /committees/:id — Exec+ (committees.manage), NOT chair-
// scoped: a chair can edit their committee but not dissolve it. The channel
// is archived rather than removed so its messages survive, same as the real
// route.
export function deleteCommittee(id: string): { deleted: true } {
  if (!can(getCurrentDemoUserId(), "committees.manage")) {
    throw new DemoApiError(403, "Not authorized to delete committees");
  }
  const index = db.committees.findIndex((x) => x.id === id);
  if (index === -1) throw new DemoApiError(404, "Committee not found");

  const channel = db.channels.find((c) => c.committeeId === id);
  if (channel) channel.archivedAt = new Date().toISOString();

  db.committees.splice(index, 1);
  // Cascade the memberships, matching CommitteeMembership's ON DELETE CASCADE.
  for (let i = db.committeeMemberships.length - 1; i >= 0; i--) {
    if (db.committeeMemberships[i].committeeId === id) db.committeeMemberships.splice(i, 1);
  }
  return { deleted: true };
}

export function updateCommittee(id: string, payload: { name?: string; description?: string }): Committee {
  const c = db.committees.find((x) => x.id === id);
  if (!c) throw new DemoApiError(404, "Committee not found");
  const isExecOrAbove = can(getCurrentDemoUserId(), "committees.manage");
  if (!isExecOrAbove && !committeeManageAccess(getCurrentDemoUserId(), id)) {
    throw new DemoApiError(403, "Not authorized to edit this committee");
  }
  // Renaming is exec-only — see the same guard on the real PATCH
  // /committees/:id. A chair can still edit description/members.
  if (payload.name !== undefined) {
    if (!isExecOrAbove) throw new DemoApiError(403, "Renaming a committee is Exec-only.");
    c.name = payload.name;
  }
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
  const isExecOrAbove = can(getCurrentDemoUserId(), "committees.manage");
  if (!isExecOrAbove && !committeeManageAccess(getCurrentDemoUserId(), committeeId)) {
    throw new DemoApiError(403, "Not authorized to manage this committee's members");
  }
  // UPSERT, matching POST /committees/:id/members on the real backend — the
  // route is "add OR promote", and re-posting an existing member with a
  // different role is how a promotion/demotion is expressed. This previously
  // only handled the create half, so promoting an existing member to CHAIR
  // silently did nothing in Demo Mode while working against the real API.
  const role = payload.role ?? "MEMBER";
  // A chair (reaching here only via committeeManageAccess, not the
  // committees.manage role-tier permission) can't demote themselves out of
  // being head — see the same guard on the real POST /committees/:id/members.
  if (payload.userId === getCurrentDemoUserId() && role !== "CHAIR" && !isExecOrAbove) {
    throw new DemoApiError(403, "You can't remove yourself as head — ask an Exec.");
  }
  const existing = db.committeeMemberships.find((m) => m.committeeId === committeeId && m.userId === payload.userId);
  if (existing) {
    existing.role = role;
  } else {
    db.committeeMemberships.push({ committeeId, userId: payload.userId, role });
  }

  // Committee chairs administer the committee's channel — same mapping the
  // backend applies in the same transaction.
  if (c.channelId) {
    const channelRole = role === "CHAIR" ? "ADMIN" : "MEMBER";
    const channelMembership = db.channelMemberships.find(
      (m) => m.channelId === c.channelId && m.userId === payload.userId
    );
    if (channelMembership) {
      channelMembership.role = channelRole;
    } else {
      db.channelMemberships.push({ channelId: c.channelId, userId: payload.userId, role: channelRole });
    }
  }

  return { committeeId, committeeName: c.name, role };
}

export function removeCommitteeMember(committeeId: string, userId: string): void {
  const isExecOrAbove = can(getCurrentDemoUserId(), "committees.manage");
  if (!isExecOrAbove && !committeeManageAccess(getCurrentDemoUserId(), committeeId)) {
    throw new DemoApiError(403, "Not authorized to manage this committee's members");
  }
  // Same reasoning as addCommitteeMember's self-downgrade guard: a chair
  // can't remove themselves from their own committee.
  if (userId === getCurrentDemoUserId() && !isExecOrAbove) {
    throw new DemoApiError(403, "You can't remove yourself from a committee you chair — ask an Exec.");
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

export function createTeam(payload: { name: string; color?: string | null }): Team {
  if (!can(getCurrentDemoUserId(), "teams.manage")) throw new DemoApiError(403, "Not authorized to manage teams");
  const name = payload.name.trim();
  if (!name) throw new DemoApiError(400, "Give the team a name.");
  if (db.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    throw new DemoApiError(409, "A team with that name already exists");
  }
  const team: db.MockTeam = { id: db.nextId("team"), name, color: payload.color?.trim() || "#5B6CC0" };
  db.teams.push(team);
  return toTeam(team);
}

/** Regent, Vice Regent, or Super Admin only — narrower than create/delete,
 * same as the real PATCH /teams/:id. */
export function renameTeam(id: string, name: string): Team {
  if (!can(getCurrentDemoUserId(), "teams.rename")) throw new DemoApiError(403, "Not authorized to rename teams");
  const team = db.findTeam(id);
  if (!team) throw new DemoApiError(404, "Team not found");
  const trimmed = name.trim();
  if (!trimmed) throw new DemoApiError(400, "Give the team a name.");
  if (db.teams.some((t) => t.id !== id && t.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new DemoApiError(409, "A team with that name already exists");
  }
  team.name = trimmed;
  return toTeam(team);
}

/** Members return to no team, same as the real DELETE /teams/:id (ON DELETE
 * SET NULL) — not reassigned to another team first. */
export function deleteTeam(id: string): void {
  if (!can(getCurrentDemoUserId(), "teams.manage")) throw new DemoApiError(403, "Not authorized to manage teams");
  const idx = db.teams.findIndex((t) => t.id === id);
  if (idx < 0) throw new DemoApiError(404, "Team not found");
  db.teams.splice(idx, 1);
  for (const u of db.users) {
    if (u.teamId === id) u.teamId = null;
  }
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
  // Archived channels are read-only for everyone — mirrors canPostToChannel
  // in backend/routes/messages.routes.ts.
  if (channel.archivedAt) return false;
  switch (channel.type) {
    case "GENERAL":
      // Open to every member. Pinning here (the chapter announcement) is the
      // restricted action instead — see pinMessage below.
      return true;
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
    archivedAt: c.archivedAt ?? null,
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

export function listChannels(params?: { includeArchived?: string | boolean }): Channel[] {
  const userId = getCurrentDemoUserId();
  const includeArchived = String(params?.includeArchived) === "true";
  return db.channels
    .filter((c) => (includeArchived || !c.archivedAt) && channelVisible(c, userId))
    .map((c) => toChannel(c, userId));
}

// Mirrors POST /channels — only GENERAL/OFFICERS, same name normalization as
// the real route and as committee channel creation.
export function createChannel(payload: { name: string; type: "GENERAL" | "OFFICERS" }): Channel {
  const userId = getCurrentDemoUserId();
  if (!can(userId, "messaging.manageChannels")) {
    throw new DemoApiError(403, "Not authorized to manage channels");
  }
  const name = `#${payload.name.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-")}`;
  const channel: db.MockChannel = { id: db.nextId("chan"), name, type: payload.type };
  db.channels.push(channel);
  return toChannel(channel, userId);
}

// Mirrors PATCH /channels/:id/archive — reversible, and #general is pinned
// open for the same reason as the real route (the dashboard reads it).
export function setChannelArchived(channelId: string, archived: boolean): Channel {
  const userId = getCurrentDemoUserId();
  if (!can(userId, "messaging.manageChannels")) {
    throw new DemoApiError(403, "Not authorized to manage channels");
  }
  const channel = db.channels.find((c) => c.id === channelId);
  if (!channel) throw new DemoApiError(404, "Channel not found");
  if (archived && channel.type === "GENERAL") {
    throw new DemoApiError(400, "The general channel can't be archived.");
  }
  channel.archivedAt = archived ? new Date().toISOString() : null;
  return toChannel(channel, userId);
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

// Mirrors PATCH /messages/:id/pin — pinning in #general IS the chapter
// announcement and needs `messaging.announce` (Regent/Vice Regent by office);
// pinning anywhere else is ordinary moderation.
export function pinMessage(messageId: string, pinned: boolean): Message {
  const userId = getCurrentDemoUserId();
  const m = db.findMessage(messageId);
  if (!m) throw new DemoApiError(404, "Message not found");
  const channel = db.channels.find((c) => c.id === m.channelId);
  const required = channel?.type === "GENERAL" ? "messaging.announce" : "messaging.moderate";
  if (!can(userId, required)) {
    throw new DemoApiError(
      403,
      required === "messaging.announce"
        ? "Only the Regent or Vice Regent can post chapter announcements."
        : "Not authorized to pin messages"
    );
  }
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
  currentSemesterId: string | null;
  currentSemesterLabel: string | null;
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

  // Mirrors the real backend's addition — one "current" semester exists in
  // this mock world by construction, unlike the real schema's date-ranged
  // Semester rows, but the shape agrees so screens don't special-case Demo
  // Mode to get the id they need for "bill everyone".
  return { records, summary, currentSemesterId: db.semester.id, currentSemesterLabel: db.semester.label };
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

// amountOwed/plan fall back to the chapter's configured defaults, matching
// POST /dues/initialize on the real backend.
export function initializeSemesterDues(payload: {
  semesterId: string;
  amountOwed?: number;
  plan?: DuesPlan;
  dueDate?: string;
  userIds?: string[];
}): { created: number; total: number } {
  if (!can(getCurrentDemoUserId(), "dues.manage")) throw new DemoApiError(403, "Not authorized to initialize dues");
  const targets = payload.userIds?.length
    ? payload.userIds
    : db.users.filter((u) => u.status === "ACTIVE" || u.status === "PNM").map((u) => u.id);

  const amountOwed = payload.amountOwed ?? db.chapterSettings.defaultDuesAmount;
  const plan = payload.plan ?? (db.chapterSettings.defaultDuesPlan as DuesPlan);

  let created = 0;
  for (const userId of targets) {
    if (db.findDuesRecord(userId, payload.semesterId)) continue;
    db.duesRecords.push({
      id: db.nextId("dues"),
      userId,
      semesterId: payload.semesterId,
      amountOwed,
      amountPaid: 0,
      status: "UNPAID",
      plan,
      dueDate: payload.dueDate ?? null,
    });
    created += 1;
  }
  return { created, total: targets.length };
}

// Mirrors PATCH /dues/:userId — the per-member half: one person moved onto
// instalments or given a different amount, without touching anyone else.
export function updateMemberDues(
  userId: string,
  payload: { semesterId: string; amountOwed?: number; plan?: DuesPlan | null; dueDate?: string | null }
): DuesRecord {
  if (!can(getCurrentDemoUserId(), "dues.manage")) throw new DemoApiError(403, "Not authorized to manage dues");
  const user = db.findUser(userId);
  if (!user) throw new DemoApiError(404, "Member not found");

  let record = db.findDuesRecord(userId, payload.semesterId);
  if (!record) {
    record = {
      id: db.nextId("dues"),
      userId,
      semesterId: payload.semesterId,
      amountOwed: payload.amountOwed ?? db.chapterSettings.defaultDuesAmount,
      amountPaid: 0,
      status: "UNPAID",
      plan: payload.plan ?? (db.chapterSettings.defaultDuesPlan as DuesPlan),
      dueDate: payload.dueDate ?? null,
    };
    db.duesRecords.push(record);
  } else {
    if (payload.amountOwed !== undefined) record.amountOwed = payload.amountOwed;
    if (payload.plan !== undefined) record.plan = payload.plan;
    if (payload.dueDate !== undefined) record.dueDate = payload.dueDate;
  }
  return toDuesRecord(record);
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
  amount: number | string; // multipart bodies flatten every field to a string — see parseBody in mocks/router.ts
  description: string;
  date: string;
  receiptLabel?: string;
  /** Present only when submitted with a real receipt photo attached
   * (SubmitExpensePage.tsx) — Demo Mode has no real object storage (same
   * gap as document uploads), so this only ever contributes its filename
   * as the label, never an actual stored/downloadable file. */
  file?: File;
}): Expense {
  const userId = getCurrentDemoUserId();
  if (!isExecOrAbove(userId) && !committeeChairOf(userId).includes(payload.committeeId)) {
    throw new DemoApiError(403, "Only this committee's chair can submit an expense against its budget");
  }
  if (!db.committees.some((c) => c.id === payload.committeeId)) throw new DemoApiError(404, "Committee not found");
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new DemoApiError(400, "Amount must be greater than zero");
  if (!payload.description.trim()) throw new DemoApiError(400, "Description is required");

  const expense: db.MockExpense = {
    id: db.nextId("exp"),
    committeeId: payload.committeeId,
    submittedById: userId,
    amount,
    description: payload.description.trim(),
    date: payload.date,
    receiptLabel: payload.file?.name ?? payload.receiptLabel ?? null,
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

// Office-scoped grants (e.g. Scribe → role numbers) — parallel to the role
// preset editor above (account-system spec §6/§11).
const EDITABLE_OFFICES: ExecOffice[] = [
  "REGENT", "VICE_REGENT", "TREASURER", "SCRIBE", "MARSHAL",
  "CORRESPONDING_SECRETARY", "NEW_MEMBER_EDUCATOR",
];

export function getOfficePermissions(): { office: ExecOffice; permissions: Permission[] }[] {
  return EDITABLE_OFFICES.map((office) => ({ office, permissions: db.officePermissions[office] ?? [] }));
}

export function updateOfficePermissions(office: ExecOffice, permissions: Permission[]): { office: ExecOffice; permissions: Permission[] } {
  if (!can(getCurrentDemoUserId(), "permissions.manage")) {
    throw new DemoApiError(403, "Not authorized to modify office permissions");
  }
  db.officePermissions[office] = permissions;
  return { office, permissions };
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

/** Attaches the CURRENT folder {id,name} — never stored on the row itself,
 * so a rename shows up on every document in that folder immediately. */
function toChapterDocument(raw: Omit<ChapterDocument, "folder">): ChapterDocument {
  const folder = raw.folderId ? db.findFolder(raw.folderId) : undefined;
  return { ...raw, folder: folder ? { id: folder.id, name: folder.name } : null };
}

export function listDocuments(params: { category?: DocumentCategory; folderId?: string }): ChapterDocument[] {
  let list = db.documents.slice();
  if (params.category) list = list.filter((d) => d.category === params.category);
  if (params.folderId) list = list.filter((d) => d.folderId === params.folderId);
  return list.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(toChapterDocument);
}

export function listDocumentFolders(): DocumentFolder[] {
  return db.documentFolders
    .slice()
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((f) => ({
      id: f.id,
      name: f.name,
      order: f.order,
      documentCount: db.documents.filter((d) => d.folderId === f.id).length,
    }));
}

export function createDocumentFolder(name: string): DocumentFolder {
  if (!can(getCurrentDemoUserId(), "documents.upload")) {
    throw new DemoApiError(403, "Not authorized to manage document folders");
  }
  const trimmed = name.trim();
  if (!trimmed) throw new DemoApiError(400, "Give the folder a name.");
  if (db.documentFolders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new DemoApiError(409, `A folder named "${trimmed}" already exists`);
  }
  const maxOrder = db.documentFolders.reduce((max, f) => Math.max(max, f.order), -1);
  const folder: db.MockDocumentFolder = { id: db.nextFolderId(), name: trimmed, order: maxOrder + 1 };
  db.documentFolders.push(folder);
  return { ...folder, documentCount: 0 };
}

export function renameDocumentFolder(id: string, name: string): DocumentFolder {
  if (!can(getCurrentDemoUserId(), "documents.upload")) {
    throw new DemoApiError(403, "Not authorized to manage document folders");
  }
  const folder = db.findFolder(id);
  if (!folder) throw new DemoApiError(404, "Folder not found");
  const trimmed = name.trim();
  if (!trimmed) throw new DemoApiError(400, "Give the folder a name.");
  if (db.documentFolders.some((f) => f.id !== id && f.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new DemoApiError(409, `A folder named "${trimmed}" already exists`);
  }
  folder.name = trimmed;
  return { ...folder, documentCount: db.documents.filter((d) => d.folderId === id).length };
}

/** Documents inside aren't deleted — they fall back to "no folder," same as
 * the real DELETE /document-folders/:id (schema.prisma: onDelete SetNull). */
export function deleteDocumentFolder(id: string): void {
  if (!can(getCurrentDemoUserId(), "documents.upload")) {
    throw new DemoApiError(403, "Not authorized to manage document folders");
  }
  const idx = db.documentFolders.findIndex((f) => f.id === id);
  if (idx < 0) throw new DemoApiError(404, "Folder not found");
  db.documentFolders.splice(idx, 1);
  for (const doc of db.documents) {
    if (doc.folderId === id) doc.folderId = null;
  }
}

export function uploadDocument(payload: {
  name: string;
  folderId?: string;
  category?: DocumentCategory;
  file?: File;
}): ChapterDocument {
  if (!can(getCurrentDemoUserId(), "documents.upload")) {
    throw new DemoApiError(403, "Not authorized to upload documents");
  }
  if (payload.folderId && !db.findFolder(payload.folderId)) {
    throw new DemoApiError(404, "Folder not found");
  }
  const user = getCurrentDemoUser();
  // Demo Mode has no real object storage (see lib/uploads.ts's real
  // counterpart) — storedFileName stays unset, same as any pre-upload-
  // feature row, so the UI correctly shows this as "nothing to download"
  // rather than pretending a file exists that was never actually kept
  // anywhere. name/size/type ARE real, straight off the picked File.
  const raw: Omit<ChapterDocument, "folder"> = {
    id: db.nextDocumentId(),
    category: payload.category ?? null,
    folderId: payload.folderId ?? null,
    name: payload.name,
    fileLabel: payload.file?.name ?? payload.name,
    sizeLabel: null,
    mimeType: payload.file?.type ?? null,
    sizeBytes: payload.file?.size ?? null,
    storedFileName: null,
    uploadedBy: { id: user.id, firstName: user.firstName, lastName: user.lastName },
    uploadedAt: new Date().toISOString(),
  };
  db.documents.push(raw);
  return toChapterDocument(raw);
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

// ── Audit log (hardening item §3) ─────────────────────────────────────────
// Demo Mode's mock mutations don't write to a shared log the way the real
// backend's writeAuditLog() does (no natural data source) — this is a
// small static, realistic-looking sample so AuditLogScreen has something
// to show rather than an always-empty list. Not meant to reflect this
// session's actual demo actions.
interface DemoAuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  actorId: string;
}

const demoAuditLog: DemoAuditEntry[] = [
  { id: "al1", action: "ROLE_CHANGE", entityType: "User", entityId: "u9", before: { role: "PNM" }, after: { role: "MEMBER" }, createdAt: db.chapterSettings.semesterStartDate, actorId: "u1" },
  { id: "al2", action: "ROLE_NUMBER_ASSIGNED", entityType: "User", entityId: "u13", before: { roleNumber: null }, after: { roleNumber: 244 }, createdAt: db.chapterSettings.semesterStartDate, actorId: "u15" },
  { id: "al3", action: "BIG_LITTLE_ASSIGNED", entityType: "User", entityId: "u10", before: { bigId: null }, after: { bigId: "u6" }, createdAt: db.chapterSettings.semesterStartDate, actorId: "u1" },
  { id: "al4", action: "DUES_WAIVE", entityType: "DuesRecord", entityId: "dues_8", before: { status: "UNPAID" }, after: { status: "WAIVED" }, createdAt: db.chapterSettings.semesterStartDate, actorId: "u3" },
  { id: "al5", action: "ROLE_PERMISSIONS_UPDATE", entityType: "RolePermission", entityId: "MEMBER", before: null, after: { permissions: db.rolePermissions.MEMBER }, createdAt: db.chapterSettings.semesterStartDate, actorId: "u1" },
];

export function getAuditLog(params: {
  entityType?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}): { entries: unknown[]; total: number; page: number; limit: number } {
  if (!isSuperAdmin(getCurrentDemoUserId())) {
    throw new DemoApiError(403, "Not authorized to view the audit log");
  }
  let list = demoAuditLog.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (params.entityType) list = list.filter((e) => e.entityType === params.entityType);
  if (params.actorId) list = list.filter((e) => e.actorId === params.actorId);

  const total = list.length;
  const limit = params.limit ?? 50;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  list = list.slice(start, start + limit);

  return {
    entries: list.map((e) => {
      const actor = db.findUser(e.actorId);
      return {
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        before: e.before,
        after: e.after,
        createdAt: e.createdAt,
        actor: actor ? { id: actor.id, firstName: actor.firstName, lastName: actor.lastName } : null,
      };
    }),
    total,
    page,
    limit,
  };
}

// ── Achievements ──────────────────────────────────────────────────────────
// Mirrors backend/routes/achievements.routes.ts. Editing is
// achievements.manage (Regent/Vice Regent by office); reading is open.

export function listAchievements(): db.MockAchievement[] {
  return [...db.achievements].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function createAchievement(payload: Omit<db.MockAchievement, "id" | "key">): db.MockAchievement {
  if (!can(getCurrentDemoUserId(), "achievements.manage")) {
    throw new DemoApiError(403, "Only the Regent or Vice Regent can edit achievements");
  }
  const achievement: db.MockAchievement = { ...payload, id: db.nextId("ach"), key: null };
  db.achievements.push(achievement);
  return achievement;
}

export function updateAchievement(id: string, payload: Partial<db.MockAchievement>): db.MockAchievement {
  if (!can(getCurrentDemoUserId(), "achievements.manage")) {
    throw new DemoApiError(403, "Only the Regent or Vice Regent can edit achievements");
  }
  const a = db.achievements.find((x) => x.id === id);
  if (!a) throw new DemoApiError(404, "Achievement not found");
  Object.assign(a, payload);
  return a;
}

export function deleteAchievement(id: string): { deleted?: true; achievement?: db.MockAchievement } {
  if (!can(getCurrentDemoUserId(), "achievements.manage")) {
    throw new DemoApiError(403, "Only the Regent or Vice Regent can edit achievements");
  }
  const index = db.achievements.findIndex((x) => x.id === id);
  if (index === -1) throw new DemoApiError(404, "Achievement not found");
  // A shipped default is disabled rather than removed — reset re-creates it
  // anyway, same as the real route.
  if (db.achievements[index].key) {
    db.achievements[index].enabled = false;
    return { achievement: db.achievements[index] };
  }
  db.achievements.splice(index, 1);
  return { deleted: true };
}

export function resetAchievements(): db.MockAchievement[] {
  if (!can(getCurrentDemoUserId(), "achievements.manage")) {
    throw new DemoApiError(403, "Only the Regent or Vice Regent can edit achievements");
  }
  db.achievements.length = 0;
  db.achievements.push(...db.DEFAULT_ACHIEVEMENTS.map((a, i) => ({ ...a, id: `ach_${i + 1}` })));
  return listAchievements();
}
