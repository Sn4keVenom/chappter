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
//   · events.ts already defines EventDetail and RsvpStatus — keep those;
//     this file adds everything else and re-exports to avoid circular deps.

// ─────────────────────────────────────────────────────────────────────────
// Enums (string literals matching Prisma enum names)
// ─────────────────────────────────────────────────────────────────────────

export type UserRole = "MEMBER" | "OFFICER" | "EXEC" | "SUPER_ADMIN";
export type MemberStatus = "ACTIVE" | "ALUMNI" | "SUSPENDED" | "PLEDGE";
export type EventCategory = "BROTHERHOOD" | "SERVICE" | "PROFESSIONAL" | "RUSH" | "ADMIN";
export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";
export type RsvpStatus = "GOING" | "MAYBE" | "NOT_GOING";
export type CheckInMethod = "QR" | "MANUAL";
export type LedgerType = "ATTENDANCE" | "BONUS" | "PENALTY" | "MANUAL_ADJUSTMENT";
export type CommitteeRole = "MEMBER" | "CHAIR";
export type ChannelType = "GENERAL" | "COMMITTEE" | "OFFICERS" | "DM";
export type ChannelMemberRole = "MEMBER" | "ADMIN";
export type DuesStatus = "PAID" | "PARTIAL" | "UNPAID" | "WAIVED";
export type PaymentMethod = "STRIPE" | "CASH" | "VENMO" | "CHECK" | "OTHER";

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
  status: MemberStatus;
  pledgeClassLabel?: string | null;
  committeeChairOf: string[];
  committeeMemberships?: CommitteeMembershipSummary[];
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
  role: UserRole;
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
}

export interface PointsSummary {
  total: number;
  rank: number | null;
  semesterLabel: string | null;
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
