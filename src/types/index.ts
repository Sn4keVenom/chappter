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
  "committees.manage",
  "dues.manage",
  "finance.manage",
  "teams.manage",
  "feedback.view",
  "feedback.manage",
  "users.manage",
  "settings.manage",
  "modules.manage",
  "permissions.manage",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// Wire format for GET/PATCH of a role's permission set — see
// src/permissions/permissions.ts for the mutable in-memory map this mirrors
// and api/permissions.ts for the client wrapper.
export interface RolePermissions {
  role: UserRole;
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

export interface ChapterDocument {
  id: string;
  category: DocumentCategory;
  name: string;
  // Demo mode stores only a placeholder label (e.g. "bylaws_2026.pdf") — no
  // real file storage. See docs/DEMO_MODE.md for the production gap.
  fileLabel: string;
  sizeLabel?: string | null;
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

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  office?: ExecOffice | null;
  status: MemberStatus;
  pledgeClassLabel?: string | null;
  committeeChairOf: string[];
  committeeMemberships?: CommitteeMembershipSummary[];
  teamId?: string | null;
  teamName?: string | null;
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
  role: UserRole;
  office?: ExecOffice | null;
  status: MemberStatus;
  pledgeClassLabel?: string | null;
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
  attendanceDelegates: EventDelegate[];
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
  // Demo mode stores only a placeholder label (e.g. "receipt_1.jpg") — no
  // real file upload/storage. A production build would need real object
  // storage (S3/GCS) and a signed-URL upload flow.
  receiptLabel?: string | null;
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
// Utilities
// ─────────────────────────────────────────────────────────────────────────

export function fullName(user: Pick<UserSummary, "firstName" | "lastName">): string {
  return `${user.firstName} ${user.lastName}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
