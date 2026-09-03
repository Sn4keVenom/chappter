// src/types/index.ts
//
// Single source of truth for all TypeScript types used across the mobile app.
// Mirrors schema.prisma models exactly — field names match the Prisma output
// so there's no transformation layer needed between API responses and UI.
//
// Integration points:
//   · All api/*.ts files import from here for request/response typing
//   · All store/*.ts files import from here for state shape typing
//   · All screen components import from here for prop/local-state typing
//   · src/permissions/permissions.ts is the engine that consumes Permission/
//     UserRole/RolePermissions defined here — see that file for hasPermission()
//     and the default role presets.

// ─────────────────────────────────────────────────────────────────────────
// Membership status & roles
//
// Status describes where someone is in the membership lifecycle. Role
// describes their permission tier. They're independent fields — most PNMs
// happen to have role PNM and most Alumni happen to have role ALUMNI, but a
// Super Admin can assign either independently (e.g. an Alumni-status brother
// who still needs Exec-level access during a transition period).
// ─────────────────────────────────────────────────────────────────────────

export type MemberStatus = "ACTIVE" | "PNM" | "ALUMNI" | "INACTIVE";

export type UserRole = "SUPER_ADMIN" | "EXEC" | "MEMBER" | "PNM" | "ALUMNI";

// Named exec-board positions — independent from UserRole/Permission on
// purpose (per product spec: "Office should be independent from permissions
// so new offices can be added easily later"). An office is a label an Exec
// member holds; it never itself grants access — permissions.ts never checks
// `office` directly, only `role` + the mutable role→permission map. Adding a
// new office is just adding a string here, no permission-engine changes.
export type ExecOffice =
  | "REGENT"
  | "VICE_REGENT"
  | "TREASURER"
  | "SCRIBE"
  | "MARSHAL"
  | "CORRESPONDING_SECRETARY"
  | "NEW_MEMBER_EDUCATOR";

export type EventCategory = "BROTHERHOOD" | "SERVICE" | "PROFESSIONAL" | "RUSH" | "ADMIN";
export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";
export type RsvpStatus = "GOING" | "MAYBE" | "NOT_GOING";
export type CheckInMethod = "QR" | "MANUAL";
export type LedgerType = "ATTENDANCE" | "BONUS" | "PENALTY" | "MANUAL_ADJUSTMENT";
export type CommitteeRole = "MEMBER" | "CHAIR";
export type ChannelType = "GENERAL" | "COMMITTEE" | "OFFICERS" | "DM";
export type ChannelMemberRole = "MEMBER" | "ADMIN";
export type DuesStatus = "PAID" | "PARTIAL" | "UNPAID" | "WAIVED";
export type PaymentMethod = "STRIPE" | "PYLI" | "CASH" | "VENMO" | "CHECK" | "OTHER";
export type DuesPlan = "FULL" | "MONTHLY";
export type ReimbursementStatus = "SUBMITTED" | "APPROVED" | "REIMBURSED" | "REJECTED";

// ─────────────────────────────────────────────────────────────────────────
// Permission system (spec §3) — "Roles should simply be permission
// presets." Permission is a flat, namespaced string union so adding a new
// permission later is a one-line addition here plus a default assignment in
// permissions.ts, no structural/schema change. Grouped by the module the
// action belongs to (also how the Super Admin permissions-editor UI groups
// them) — the namespace prefix (before the ".") IS the group.
// ─────────────────────────────────────────────────────────────────────────

export const ALL_PERMISSIONS = [
  "events.view",
  "events.create",
  "events.edit",
  "events.delete",
  "attendance.view",
  "attendance.take",
  "attendance.edit",
  "documents.view",
  "documents.upload",
  "documents.delete",
  "points.award",
  "points.deduct",
  "messaging.post",
  "messaging.moderate",
  // Creating/archiving channels is separate from moderating messages inside
  // one: an Exec runs the channel list, but announcing to the whole chapter
  // is narrower still and granted by office (Regent/Vice Regent) rather than
  // role — see DEFAULT_OFFICE_PRESETS in permissions/permissions.ts.
  "messaging.manageChannels",
  "messaging.announce",
  // Editing the chapter's achievement badges — granted by office to
  // Regent/Vice Regent, not to Exec at large.
  "achievements.manage",
  "committees.manage",
  "dues.manage",
  "finance.manage",
  "teams.manage",
  // Renaming a team is narrower than the rest of teams.manage (create/
  // delete/roster) — granted by office to Regent/Vice Regent, not Exec at
  // large. Same shape as achievements.manage above.
  "teams.rename",
  // Awarding Brother of the Week — office-granted (Regent/Vice Regent); the
  // current holder can also pass the title on themselves, checked
  // separately in the route rather than through this permission (spec: "or
  // any member with the tag").
  "brotherOfWeek.award",
  // The scribe's per-category (Brotherhood/Service/Professional/Rush)
  // attendance breakdown — who's covered which requirement and who hasn't.
  "attendance.viewReport",
  // Starting a new semester — the mechanism behind "reset all points":
  // the leaderboard is already scoped per-semester, so a new one reads as
  // 0 for everyone while every past semester's ranking stays queryable,
  // with nothing about Attendance (which isn't semester-scoped) touched.
  "semesters.manage",
  "feedback.view",
  "feedback.manage",
  "users.manage",
  "settings.manage",
  "modules.manage",
  "permissions.manage",
  // Chapter/membership system (account-system expansion) — chapters.manage
  // covers chapter identity (create/edit); chapters.manageInvites covers
  // invite codes/links + join-request review; membership.assignRoleNumber
  // and membership.manageRelationships are deliberately separate from
  // users.manage (spec §11 calls them out as distinct concerns), and the
  // former is granted by office (see DEFAULT_OFFICE_PRESETS in
  // permissions/permissions.ts), not just role.
  "chapters.manage",
  "chapters.manageInvites",
  "membership.assignRoleNumber",
  "membership.manageRelationships",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// Wire format for GET/PATCH of a role's permission set — see
// src/permissions/permissions.ts for the mutable in-memory map this mirrors
// and api/permissions.ts for the client wrapper.
export interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
}

// Parallel wire format for office-scoped grants (e.g. Scribe → role
// numbers) — see DEFAULT_OFFICE_PRESETS in permissions/permissions.ts.
export interface OfficePermissions {
  office: ExecOffice;
  permissions: Permission[];
}

// ─────────────────────────────────────────────────────────────────────────
// Module / feature toggles (spec §5)
// ─────────────────────────────────────────────────────────────────────────

export type ModuleKey =
  | "events"
  | "attendance"
  | "messaging"
  | "documents"
  | "points"
  | "calendar"
  | "feedback"
  | "committees"
  | "dues"
  | "teams"
  // Placeholders proving the module system scales to features not built yet —
  // toggling these currently has no attached screens (see docs/DEMO_MODE.md).
  | "officeInventory"
  | "attendanceRaffles";

export interface ModuleConfig {
  key: ModuleKey;
  label: string;
  description?: string | null;
  enabled: boolean;
  comingSoon?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Chapter Settings (spec §6) — centralized, the primary place future
// chapter-wide customization should live.
// ─────────────────────────────────────────────────────────────────────────

export interface ChapterSettings {
  chapterName: string;
  chapterLetters: string;
  university: string;
  logoUrl?: string | null;
  currentSemesterLabel: string;
  semesterStartDate: string;
  semesterEndDate: string;
  defaultDuesAmount: number;
  defaultDuesPlan: DuesPlan;
  attendanceLateThresholdMinutes: number;
  defaultEventPointValue: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Chapter branding — the chapter's visual identity (colors, name, logo).
//
// Deliberately a separate resource from both ChapterSettings (operational
// config: dues amounts, semester dates) and from the individual user's
// appearance preference (System/Light/Dark, stored on-device only). Branding
// is chapter-wide and admin-controlled; appearance is personal. The theme
// engine combines them: buildPalette(resolvedScheme, branding).
//
// Served by GET/PATCH /chapters/:id/branding — see src/api/branding.ts. The
// mock implementation lives in src/mocks/api.ts; the real backend does not
// expose these routes yet (see docs note in api/branding.ts).
// ─────────────────────────────────────────────────────────────────────────

export interface ChapterBranding {
  chapterId: string;
  /** Display name used in headers and the branding preview. */
  chapterName: string;
  chapterLetters: string;
  /** Remote logo image URL. Null when the chapter uses the monogram instead. */
  logoUrl?: string | null;
  /**
   * Emoji/character monogram shown when there's no uploaded logo. Demo Mode
   * has no file storage, so this is the honest stand-in — and it stays useful
   * in production as the fallback before a logo is uploaded.
   */
  logoEmoji?: string | null;
  /** Hex. Solid fills: buttons, headers, avatars, selected states. */
  primaryColor: string;
  /** Hex. Highlights: active tab, rank badges, required-event tags. */
  accentColor: string;
  /** Optional hex wash applied to backgrounds in light mode. */
  backgroundTintLight?: string | null;
  /** Optional hex wash applied to backgrounds in dark mode. */
  backgroundTintDark?: string | null;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Documents & file management (spec §8)
// ─────────────────────────────────────────────────────────────────────────

export type DocumentCategory =
  | "CONSTITUTION"
  | "BYLAWS"
  | "MEETING_MINUTES"
  | "RECRUITMENT"
  | "FORMS"
  | "OFFICER_RESOURCES"
  | "OTHER";

// Chapter-managed, addable/removable buckets documents are filed into —
// replaces what used to be the fixed 7-value DocumentCategory set above
// (still present on ChapterDocument.category for any pre-existing row, but
// no longer required for a new one). See schema.prisma's DocumentFolder
// doc comment for why both coexist rather than one replacing the other.
export interface DocumentFolder {
  id: string;
  name: string;
  order: number;
  documentCount: number;
}

export interface ChapterDocument {
  id: string;
  category: DocumentCategory | null;
  folderId: string | null;
  folder: { id: string; name: string } | null;
  name: string;
  fileLabel: string;
  sizeLabel?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  // Present only once a real file has been attached (lib/uploads.ts on the
  // backend) — null means a pre-upload-feature row with nothing to
  // download. Not itself a usable URL; GET /documents/:id/file is.
  storedFileName?: string | null;
  uploadedBy: { id: string; firstName: string; lastName: string };
  uploadedAt: string;
}

export interface ExternalLink {
  id: string;
  label: string;
  url: string;
  category?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Feedback & bug reports (spec §9)
// ─────────────────────────────────────────────────────────────────────────

export type FeedbackType = "BUG" | "FEATURE_REQUEST" | "GENERAL";
export type FeedbackStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";

export interface FeedbackReport {
  id: string;
  type: FeedbackType;
  message: string;
  submittedBy: { id: string; firstName: string; lastName: string } | null;
  appVersion: string;
  platform: string;
  status: FeedbackStatus;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Core entities
// ─────────────────────────────────────────────────────────────────────────

// User is the flattened wire shape: identity fields from the User table
// plus — when the person has joined a chapter — their active
// ChapterMembership's fields flattened onto the same object (role, office,
// status, roleNumber, big/littles, major, graduationYear, pledgeClassLabel).
// The database keeps these on separate rows (see backend schema.prisma
// Chapter/ChapterMembership doc comment) so role numbers can be unique per
// chapter and Big/Little resolve within one chapter's roster; the API
// flattens them back so existing screens that read `user.role` etc. don't
// need to change. role/office/status/roleNumber are only present once
// hasChapter is true.
export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  major?: string | null;
  graduationYear?: number | null;
  // True once this user has an active chapter membership (redeemed an
  // invite or had a join request approved). False right after account
  // creation/email verification — see spec §2/§3: never auto-assigned.
  hasChapter: boolean;
  // Only populated (by /auth/sync and GET /chapters/me/pending) when
  // hasChapter is false — lets onboarding show "pending approval" instead
  // of the join options when one's already outstanding.
  pendingJoinRequest?: ChapterJoinRequest | null;
  chapterId?: string | null;
  role?: UserRole;
  office?: ExecOffice | null;
  status?: MemberStatus;
  roleNumber?: number | null;
  pledgeClassLabel?: string | null;
  big?: FamilyMemberSummary | null;
  littles?: FamilyMemberSummary[];
  committeeChairOf: string[];
  committeeMemberships?: CommitteeMembershipSummary[];
  teamId?: string | null;
  teamName?: string | null;
}

export interface UserSummary {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
  role?: UserRole;
  office?: ExecOffice | null;
  status?: MemberStatus;
  roleNumber?: number | null;
  pledgeClassLabel?: string | null;
}

// Lightweight reference to a family relation (Big or a Little) — enough to
// render a row and navigate to their full profile. See MyFamilyScreen and
// GET /users/:id/family.
export interface FamilyMemberSummary {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  roleNumber?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Chapters, invites, join requests (spec §3)
// ─────────────────────────────────────────────────────────────────────────

export interface ChapterSummary {
  id: string;
  name: string;
  letters?: string | null;
  university?: string | null;
  logoUrl?: string | null;
}

export interface ChapterInvite {
  id: string;
  chapterId: string;
  code: string;
  /** Admin-facing name, e.g. "Fall 2026 Rush". Optional; falls back to code. */
  label?: string | null;
  /** Role granted to whoever redeems this code. */
  role: UserRole;
  /** Membership status granted on redemption. */
  status: MemberStatus;
  maxUses?: number | null;
  useCount: number;
  expiresAt?: string | null;
  /**
   * Admin "paused" switch — independent of archiving. A paused code can be
   * re-enabled with one tap; an archived one is retired for good.
   */
  active: boolean;
  /**
   * Set when the code is archived. Archived codes can never be redeemed and
   * move to the archived section of the invite manager. (The backend column
   * is `revokedAt`; "archive" is the same operation with clearer wording.)
   */
  revokedAt?: string | null;
  /** Set when the code string was last regenerated, invalidating the old one. */
  regeneratedAt?: string | null;
  lastUsedAt?: string | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

/**
 * Derived lifecycle state for an invite — the single place this logic lives,
 * so the list, the badges, and the redemption check can never disagree.
 * Order matters: archived beats expired beats exhausted beats paused.
 */
export type InviteState =
  | "ARCHIVED"
  | "EXPIRED"
  | "EXHAUSTED"
  | "PAUSED"
  | "EXPIRING_SOON"
  | "ACTIVE";

/** An invite is "expiring soon" within this many days of its expiry. */
export const INVITE_EXPIRING_SOON_DAYS = 7;

export function inviteState(invite: ChapterInvite, now: Date = new Date()): InviteState {
  if (invite.revokedAt) return "ARCHIVED";
  if (invite.expiresAt && new Date(invite.expiresAt) <= now) return "EXPIRED";
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return "EXHAUSTED";
  if (!invite.active) return "PAUSED";
  if (invite.expiresAt) {
    const daysLeft = (new Date(invite.expiresAt).getTime() - now.getTime()) / 86_400_000;
    if (daysLeft <= INVITE_EXPIRING_SOON_DAYS) return "EXPIRING_SOON";
  }
  return "ACTIVE";
}

/** True when a code can still be redeemed right now. */
export function isInviteRedeemable(invite: ChapterInvite, now: Date = new Date()): boolean {
  const state = inviteState(invite, now);
  return state === "ACTIVE" || state === "EXPIRING_SOON";
}

export interface ChapterJoinRequest {
  id: string;
  chapterId: string;
  chapterName?: string;
  message?: string | null;
  status: "PENDING" | "APPROVED" | "DENIED";
  /**
   * Set only when this request was auto-filed by claiming a verified roster
   * entry (see api/roster.ts claimRoleNumber) — the backend derives these
   * from the matched ChapterRosterEntry, never from client input. Null for
   * an ordinary browse-chapter/invite-adjacent request.
   */
  roleNumber?: number | null;
  memberStatus?: MemberStatus | null;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; email: string };
}

/**
 * Exec-maintained verification roster — real member/alumni identity data,
 * pre-loaded independent of who has actually signed up, checked against a
 * new signup's claimed name + role number. See ChapterRosterEntry's doc
 * comment in backend/prisma/schema.prisma for why this is a separate list
 * from ChapterMembership.roleNumber (which is only assigned to someone
 * AFTER they already have an account).
 */
export interface ChapterRosterEntry {
  id: string;
  chapterId: string;
  firstName: string;
  lastName: string;
  roleNumber: number;
  /** ACTIVE, INACTIVE, or ALUMNI — a PNM never has a role number. */
  status: Extract<MemberStatus, "ACTIVE" | "INACTIVE" | "ALUMNI">;
  /** Set once a signup successfully matches and claims this row. */
  claimedByUserId?: string | null;
  createdAt: string;
}

export interface Semester {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Committees
// ─────────────────────────────────────────────────────────────────────────

export interface Committee {
  id: string;
  name: string;
  description?: string | null;
  channelId?: string | null;
  memberCount: number;
  members: CommitteeMemberSummary[];
}

export interface CommitteeMemberSummary {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role: CommitteeRole;
}

export interface CommitteeMembershipSummary {
  committeeId: string;
  committeeName: string;
  role: CommitteeRole;
}

// ─────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────

export interface EventSummary {
  id: string;
  title: string;
  location?: string | null;
  category: EventCategory;
  startTime: string;
  endTime: string;
  attendanceRequired: boolean;
  pointValue: number;
  committeeId?: string | null;
  committee?: { id: string; name: string } | null;
  myRsvpStatus: RsvpStatus | null;
  // `late` is included because EventDetailScreen renders different text for it.
  // Both GET /events and GET /events/:id return this field.
  myAttendance: { pointsAwarded: number; late: boolean } | null;
}

export interface EventDetail extends EventSummary {
  description?: string | null;
  status: EventStatus;
  checkInWindowStart?: string | null;
  checkInWindowEnd?: string | null;
  checkedInCount: number;
  // Members delegated by the event creator/committee chair to generate this
  // event's check-in code without needing general attendance-management
  // access (see Feature 3 — event-scoped delegation).
  //
  // OPTIONAL because the real backend does not return it: delegation exists
  // in Demo Mode's mock only — there is no EventDelegate table and no
  // POST/DELETE /events/:id/delegates route yet. Typing it as required made
  // `event.attendanceDelegates.length` a hard crash on every event detail
  // page against the real API. Every read must stay optional-safe until the
  // backend half is built.
  attendanceDelegates?: EventDelegate[];
}

export interface EventDelegate {
  userId: string;
  firstName: string;
  lastName: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Attendance & Points
// ─────────────────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  checkInTime: string;
  method: CheckInMethod;
  late: boolean;
  pointsAwarded: number;
  overrideReason?: string | null;
  event: { id: string; title: string; category: EventCategory; startTime: string };
}

export interface RosterEntry {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  pledgeClassLabel?: string | null;
  rsvpStatus: RsvpStatus | null;
  attendance: {
    id: string;
    checkInTime: string;
    method: CheckInMethod;
    late: boolean;
    pointsAwarded: number;
  } | null;
}

export interface LedgerEntry {
  id: string;
  amount: number;
  type: LedgerType;
  reason?: string | null;
  createdAt: string;
  event?: { id: string; title: string; category: EventCategory } | null;
  awardedBy?: { firstName: string; lastName: string } | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  total: number;
  isMe: boolean;
  // Breakdown — additive, computed from the same ledger that produces
  // `total`. attendanceCount is events checked into (ATTENDANCE-type ledger
  // rows), not a separate counter.
  attendanceCount: number;
  attendancePoints: number;
  bonusPoints: number;
  penaltyPoints: number;
}

export interface PointsSummary {
  total: number;
  rank: number | null;
  semesterLabel: string | null;
}

export interface LeaderboardResult {
  leaderboard: LeaderboardEntry[];
  semesterId: string | null;
  semesterLabel: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Teams (gamification — NOT committees, no leaders, one team per member)
// ─────────────────────────────────────────────────────────────────────────

export interface TeamMemberSummary {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  points: number;
}

export interface Team {
  id: string;
  name: string;
  color?: string | null;
  memberCount: number;
  totalPoints: number;
  members: TeamMemberSummary[];
}

export interface TeamLeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  color?: string | null;
  totalPoints: number;
  memberCount: number;
  isMyTeam: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Dues & Payments
// ─────────────────────────────────────────────────────────────────────────

export type AchievementMetric =
  | "ATTENDANCE_COUNT"
  | "TOTAL_POINTS"
  | "BONUS_COUNT"
  | "COMMITTEE_COUNT"
  | "RANK_AT_MOST"
  | "NEVER_LATE_AFTER"
  | "DUES_SETTLED";

/** A chapter's badge definition. Evaluated client-side by
 * utils/achievements.ts against data the profile already has. */
export interface AchievementDefinition {
  id: string;
  /** Set for the eight shipped defaults, null for a chapter's own. */
  key?: string | null;
  label: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  threshold: number;
  enabled: boolean;
  sortOrder: number;
}

export interface DuesRecord {
  id: string;
  userId: string;
  semesterId: string;
  amountOwed: number;
  amountPaid: number;
  status: DuesStatus;
  dueDate?: string | null;
  // Payment plan the member selected when paying via Pyli. Null until they
  // pick one — officer-recorded manual payments (cash/check/etc.) don't set
  // a plan since those are typically one-off.
  plan?: DuesPlan | null;
  semester: { id: string; label: string };
  payments?: Payment[];
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  externalRef?: string | null;
  paidAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Committee Budgets & Reimbursements
//
// Tracking only — actual money movement (paying a committee head back)
// happens outside the app. The Treasurer assigns each committee a budget
// for the semester; committee chairs submit expenses against it; the
// Treasurer reviews and records reimbursement status/method.
// ─────────────────────────────────────────────────────────────────────────

export interface CommitteeBudget {
  committeeId: string;
  committeeName: string;
  semesterId: string;
  allocated: number;
  spent: number; // sum of REIMBURSED expenses
  pending: number; // sum of SUBMITTED + APPROVED expenses, not yet paid out
  remaining: number; // allocated - spent - pending
}

export interface Expense {
  id: string;
  committeeId: string;
  committeeName: string;
  submittedBy: { id: string; firstName: string; lastName: string };
  amount: number;
  description: string;
  date: string;
  receiptLabel?: string | null;
  // Present once a real photo has been attached (lib/uploads.ts on the
  // backend) — null means either a pre-upload-feature row (receiptLabel
  // was a typed note) or one with nothing attached. GET /expenses/:id/receipt
  // serves the actual file.
  receiptStoredFileName?: string | null;
  receiptMimeType?: string | null;
  status: ReimbursementStatus;
  reimbursementMethod?: PaymentMethod | null;
  reimbursementNote?: string | null;
  reviewedBy?: { firstName: string; lastName: string } | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Messaging
// ─────────────────────────────────────────────────────────────────────────

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  committeeId?: string | null;
  committee?: { id: string; name: string } | null;
  canPost: boolean;
  /** Set once retired — the channel keeps its messages but drops out of the
   * channel list and rejects new ones. Only present when the caller asked
   * for archived channels (see listChannels({ includeArchived })). */
  archivedAt?: string | null;
  pinnedCount: number;
  lastMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
}

export interface Message {
  id: string;
  channelId: string;
  content: string;
  pinned: boolean;
  parentMessageId?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
  };
  _count?: { replies: number };
  // Optimistic-send fields (client-only)
  _pending?: boolean;
  _tempId?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Dashboard aggregate
// ─────────────────────────────────────────────────────────────────────────

export interface DashboardData {
  upcomingEvents: EventSummary[];
  duesRecord: DuesRecord | null;
  points: PointsSummary;
  pinnedAnnouncement: {
    id: string;
    content: string;
    createdAt: string;
    senderName: string;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Audit log (Super Admin only — GET /audit-log)
// ─────────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string };
}

// ─────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────

export function fullName(user: Pick<UserSummary, "firstName" | "lastName">): string {
  return `${user.firstName} ${user.lastName}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
