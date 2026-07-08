// src/mocks/seed.ts
//
// In-memory "database" for Demo Mode. Shapes mirror schema.prisma models
// exactly (same field names as the real backend would return) so the
// assembler functions in src/mocks/router.ts can build the exact same
// response shapes the real API would, and reconnecting the real backend
// later requires no changes to any screen, store, or api/*.ts file.
//
// Mutations (RSVP, check-in, sending a message, recording a payment, etc.)
// write directly into these module-level arrays, so changes persist for the
// lifetime of the JS session — exactly like a real database would, just
// without the durability. Reloading the app resets the demo to this seed.
//
// Dates are computed relative to `Date.now()` at module load so the demo
// always looks "current" (upcoming events are always in the future, recent
// history is always recent) no matter when it's actually run.

import type {
  UserRole,
  MemberStatus,
  EventCategory,
  EventStatus,
  RsvpStatus,
  CheckInMethod,
  LedgerType,
  CommitteeRole,
  ChannelType,
  ChannelMemberRole,
  DuesStatus,
  DuesPlan,
  PaymentMethod,
  OfficerTitle,
  ReimbursementStatus,
} from "../types";

// ── Date helpers ────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function daysFromNow(days: number, hour = 18, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function hoursAfter(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

// ── ID generation for records created during the demo session ──────────────

let idCounter = 10_000;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

// ── Raw record shapes (mirror schema.prisma field names) ───────────────────

export interface MockUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatarUrl?: string | null;
  role: UserRole;
  title?: OfficerTitle | null;
  status: MemberStatus;
  pledgeClassLabel?: string | null;
  teamId?: string | null; // gamification team — see MockTeam below
}

export interface MockSemester {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface MockCommittee {
  id: string;
  name: string;
  description?: string | null;
  channelId?: string | null;
}

export interface MockCommitteeMembership {
  committeeId: string;
  userId: string;
  role: CommitteeRole;
}

export interface MockEvent {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  category: EventCategory;
  status: EventStatus;
  startTime: string;
  endTime: string;
  attendanceRequired: boolean;
  pointValue: number;
  checkInWindowStart?: string | null;
  checkInWindowEnd?: string | null;
  committeeId?: string | null;
  createdById: string;
}

export interface MockRsvp {
  eventId: string;
  userId: string;
  status: RsvpStatus;
  respondedAt: string;
}

export interface MockAttendance {
  id: string;
  eventId: string;
  userId: string;
  checkInTime: string;
  method: CheckInMethod;
  late: boolean;
  pointsAwarded: number;
  overrideReason?: string | null;
  recordedById?: string | null;
}

export interface MockLedgerEntry {
  id: string;
  userId: string;
  eventId?: string | null;
  semesterId: string;
  amount: number;
  type: LedgerType;
  reason?: string | null;
  awardedById?: string | null;
  createdAt: string;
}

export interface MockDuesRecord {
  id: string;
  userId: string;
  semesterId: string;
  amountOwed: number;
  amountPaid: number;
  status: DuesStatus;
  dueDate?: string | null;
  plan?: DuesPlan | null;
}

export interface MockPayment {
  id: string;
  duesRecordId: string;
  amount: number;
  method: PaymentMethod;
  externalRef?: string | null;
  paidAt: string;
  recordedById?: string | null;
}

export interface MockChannel {
  id: string;
  name: string;
  type: ChannelType;
  committeeId?: string | null;
}

export interface MockChannelMembership {
  channelId: string;
  userId: string;
  role: ChannelMemberRole;
}

export interface MockMessage {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  parentMessageId?: string | null;
  pinned: boolean;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
}

// ── Semester ─────────────────────────────────────────────────────────────

export const semester: MockSemester = {
  id: "sem_fall2026",
  label: "Fall 2026",
  startDate: daysFromNow(-40, 0, 0),
  endDate: daysFromNow(90, 0, 0),
};

// ── Teams ────────────────────────────────────────────────────────────────
// Gamification-only groupings — NOT committees, no leaders. Defined ahead
// of `users` so team ids are available for the roster's `teamId` field.

export interface MockTeam {
  id: string;
  name: string;
  color: string;
}

export const teams: MockTeam[] = [
  { id: "team_a", name: "Team Vanguard", color: "#5B6CC0" },
  { id: "team_b", name: "Team Ironclad", color: "#2F8F6E" },
  { id: "team_c", name: "Team Apex", color: "#C8A24A" },
  { id: "team_d", name: "Team Catalyst", color: "#8B5FBF" },
];

export function findTeam(id: string): MockTeam | undefined {
  return teams.find((t) => t.id === id);
}

// ── Users ────────────────────────────────────────────────────────────────
// A realistic 15-person roster spanning every role, exec-board title, and
// membership status. Regent/Vice Regent/Scribe/Treasurer map to Feature 1–5
// permission gating (see usePermissions.ts) — SUSPENDED/ALUMNI members are
// excluded from teams since they aren't active participants.

export const users: MockUser[] = [
  { id: "u1", firstName: "Marcus", lastName: "Reyes", email: "marcus.reyes@thetatau.demo", role: "SUPER_ADMIN", title: "REGENT", status: "ACTIVE", pledgeClassLabel: "Fall 2023", phone: "555-0101", teamId: "team_a" },
  { id: "u2", firstName: "Sofia", lastName: "Nguyen", email: "sofia.nguyen@thetatau.demo", role: "EXEC", title: "VICE_REGENT", status: "ACTIVE", pledgeClassLabel: "Fall 2023", phone: "555-0102", teamId: "team_b" },
  { id: "u3", firstName: "Jordan", lastName: "Blake", email: "jordan.blake@thetatau.demo", role: "EXEC", title: "TREASURER", status: "ACTIVE", pledgeClassLabel: "Spring 2024", phone: "555-0103", teamId: "team_c" },
  { id: "u4", firstName: "Priya", lastName: "Patel", email: "priya.patel@thetatau.demo", role: "OFFICER", status: "ACTIVE", pledgeClassLabel: "Fall 2024", teamId: "team_d" },
  { id: "u5", firstName: "Ethan", lastName: "Walsh", email: "ethan.walsh@thetatau.demo", role: "OFFICER", status: "ACTIVE", pledgeClassLabel: "Fall 2024", teamId: "team_a" },
  { id: "u6", firstName: "Grace", lastName: "Kim", email: "grace.kim@thetatau.demo", role: "OFFICER", status: "ACTIVE", pledgeClassLabel: "Spring 2025", teamId: "team_b" },
  { id: "u7", firstName: "Noah", lastName: "Bennett", email: "noah.bennett@thetatau.demo", role: "MEMBER", status: "ACTIVE", pledgeClassLabel: "Fall 2024", teamId: "team_c" },
  { id: "u8", firstName: "Ava", lastName: "Torres", email: "ava.torres@thetatau.demo", role: "MEMBER", status: "ACTIVE", pledgeClassLabel: "Spring 2025", teamId: "team_d" },
  { id: "u9", firstName: "Liam", lastName: "Osei", email: "liam.osei@thetatau.demo", role: "MEMBER", status: "ACTIVE", pledgeClassLabel: "Spring 2025", teamId: "team_a" },
  { id: "u10", firstName: "Chloe", lastName: "Martinez", email: "chloe.martinez@thetatau.demo", role: "MEMBER", status: "ACTIVE", pledgeClassLabel: "Fall 2025", teamId: "team_b" },
  { id: "u11", firstName: "Dylan", lastName: "Foster", email: "dylan.foster@thetatau.demo", role: "MEMBER", status: "PLEDGE", pledgeClassLabel: "Fall 2026", teamId: "team_c" },
  { id: "u12", firstName: "Maya", lastName: "Singh", email: "maya.singh@thetatau.demo", role: "MEMBER", status: "PLEDGE", pledgeClassLabel: "Fall 2026", teamId: "team_a" },
  { id: "u13", firstName: "Ryan", lastName: "O'Connell", email: "ryan.oconnell@thetatau.demo", role: "MEMBER", status: "SUSPENDED", pledgeClassLabel: "Fall 2024" },
  { id: "u14", firstName: "Isabella", lastName: "Cruz", email: "isabella.cruz@thetatau.demo", role: "MEMBER", status: "ALUMNI", pledgeClassLabel: "Fall 2021" },
  { id: "u15", firstName: "Emma", lastName: "Chavez", email: "emma.chavez@thetatau.demo", role: "EXEC", title: "SCRIBE", status: "ACTIVE", pledgeClassLabel: "Spring 2024", phone: "555-0115", teamId: "team_c" },
];

export function findUser(id: string): MockUser | undefined {
  return users.find((u) => u.id === id);
}

// ── Committees ───────────────────────────────────────────────────────────

export const committees: MockCommittee[] = [
  { id: "c1", name: "Rush Committee", description: "Plans and runs formal recruitment each semester — info nights, bid selection, and new-member onboarding.", channelId: "ch3" },
  { id: "c2", name: "Service Committee", description: "Organizes chapter community-service events and tracks service-hour requirements.", channelId: "ch4" },
  { id: "c3", name: "Professional Development", description: "Runs resume workshops, alumni networking events, and career-focused programming.", channelId: "ch5" },
  { id: "c4", name: "Social & Brotherhood", description: "Plans brotherhood events, mixers, and the Founders Day formal.", channelId: "ch6" },
];

export const committeeMemberships: MockCommitteeMembership[] = [
  { committeeId: "c1", userId: "u4", role: "CHAIR" },
  { committeeId: "c1", userId: "u7", role: "MEMBER" },
  { committeeId: "c1", userId: "u11", role: "MEMBER" },
  { committeeId: "c1", userId: "u12", role: "MEMBER" },

  { committeeId: "c2", userId: "u5", role: "CHAIR" },
  { committeeId: "c2", userId: "u8", role: "MEMBER" },
  { committeeId: "c2", userId: "u9", role: "MEMBER" },

  { committeeId: "c3", userId: "u6", role: "CHAIR" },
  { committeeId: "c3", userId: "u9", role: "MEMBER" },
  { committeeId: "c3", userId: "u10", role: "MEMBER" },

  { committeeId: "c4", userId: "u2", role: "CHAIR" },
  { committeeId: "c4", userId: "u7", role: "MEMBER" },
  { committeeId: "c4", userId: "u8", role: "MEMBER" },
  { committeeId: "c4", userId: "u10", role: "MEMBER" },
];

// ── Events ───────────────────────────────────────────────────────────────

export const events: MockEvent[] = [
  // Past
  { id: "e1", title: "Chapter Meeting — Week 1", description: "Kickoff chapter meeting for the semester. Officer reports, calendar review, committee sign-ups.", location: "Engineering Hall, Room 140", category: "ADMIN", status: "PUBLISHED", startTime: daysFromNow(-21, 19, 0), endTime: daysFromNow(-21, 20, 0), attendanceRequired: true, pointValue: 10, committeeId: null, createdById: "u1" },
  { id: "e2", title: "Habitat for Humanity Build", description: "Full-day build with the local Habitat chapter. Wear clothes you don't mind getting paint on.", location: "412 Maple St. build site", category: "SERVICE", status: "PUBLISHED", startTime: daysFromNow(-17, 9, 0), endTime: daysFromNow(-17, 15, 0), attendanceRequired: true, pointValue: 15, committeeId: "c2", createdById: "u5" },
  { id: "e3", title: "Resume Workshop", description: "Bring a laptop and your current resume — alumni volunteers will do 1:1 reviews.", location: "Career Center, Suite 200", category: "PROFESSIONAL", status: "PUBLISHED", startTime: daysFromNow(-12, 17, 0), endTime: daysFromNow(-12, 18, 30), attendanceRequired: false, pointValue: 5, committeeId: "c3", createdById: "u6" },
  { id: "e4", title: "Rush Info Night", description: "Open house for prospective members. All brothers encouraged to attend and help represent the chapter.", location: "Chapter House", category: "RUSH", status: "PUBLISHED", startTime: daysFromNow(-9, 18, 30), endTime: daysFromNow(-9, 20, 0), attendanceRequired: false, pointValue: 5, committeeId: "c1", createdById: "u4" },
  { id: "e5", title: "Brotherhood Bowling Night", description: "Lanes reserved 7–9pm. Chapter covers the first two games.", location: "Strike Zone Lanes", category: "BROTHERHOOD", status: "PUBLISHED", startTime: daysFromNow(-5, 19, 0), endTime: daysFromNow(-5, 21, 0), attendanceRequired: false, pointValue: 5, committeeId: "c4", createdById: "u2" },
  { id: "e6", title: "Chapter Meeting — Week 3", description: "Regular chapter meeting. Dues deadline reminder, upcoming rush event planning.", location: "Engineering Hall, Room 140", category: "ADMIN", status: "PUBLISHED", startTime: daysFromNow(-3, 19, 0), endTime: daysFromNow(-3, 20, 0), attendanceRequired: true, pointValue: 10, committeeId: null, createdById: "u1" },

  // Upcoming
  { id: "e7", title: "Food Bank Volunteer Day", description: "Sorting and packing shift at the regional food bank. Sign up counts toward service requirement.", location: "Southside Regional Food Bank", category: "SERVICE", status: "PUBLISHED", startTime: daysFromNow(2, 10, 0), endTime: daysFromNow(2, 13, 0), attendanceRequired: true, pointValue: 15, committeeId: "c2", createdById: "u5" },
  { id: "e8", title: "Big/Little Reveal", description: "New members find out their bigs! Doors open 6:30, reveal starts 7:00 sharp.", location: "Chapter House", category: "BROTHERHOOD", status: "PUBLISHED", startTime: daysFromNow(5, 19, 0), endTime: daysFromNow(5, 21, 30), attendanceRequired: false, pointValue: 5, committeeId: null, createdById: "u2" },
  { id: "e9", title: "Exec Board Meeting", description: "Weekly exec sync — budget review, upcoming event approvals.", location: "Chapter House, Library", category: "ADMIN", status: "PUBLISHED", startTime: daysFromNow(6, 20, 0), endTime: daysFromNow(6, 21, 0), attendanceRequired: true, pointValue: 5, committeeId: null, createdById: "u1" },
  { id: "e10", title: "Networking Mixer w/ Alumni", description: "Casual mixer with local alumni working in tech, finance, and consulting.", location: "The Regent Hotel, Terrace Room", category: "PROFESSIONAL", status: "PUBLISHED", startTime: daysFromNow(8, 18, 0), endTime: daysFromNow(8, 20, 0), attendanceRequired: false, pointValue: 10, committeeId: "c3", createdById: "u6" },
  { id: "e11", title: "Rush Bid Night", description: "Final bid distribution and celebration. All active members required.", location: "Chapter House", category: "RUSH", status: "PUBLISHED", startTime: daysFromNow(11, 19, 0), endTime: daysFromNow(11, 22, 0), attendanceRequired: true, pointValue: 10, committeeId: "c1", createdById: "u4" },
  { id: "e12", title: "Founders Day Formal", description: "Annual formal celebrating the chapter's founding. Semi-formal attire, dinner provided.", location: "Grand Ballroom, University Union", category: "BROTHERHOOD", status: "PUBLISHED", startTime: daysFromNow(18, 18, 30), endTime: daysFromNow(18, 23, 0), attendanceRequired: false, pointValue: 0, committeeId: null, createdById: "u2" },
];

export function findEvent(id: string): MockEvent | undefined {
  return events.find((e) => e.id === id);
}

export function isPastEvent(e: MockEvent): boolean {
  return new Date(e.endTime).getTime() < Date.now();
}

// ── RSVPs (upcoming events only — mirrors real usage patterns) ─────────────

const rsvpSeed: Record<string, { going?: string[]; maybe?: string[]; notGoing?: string[] }> = {
  e7: { going: ["u1", "u2", "u5", "u7", "u8", "u9"], maybe: ["u10"], notGoing: ["u13"] },
  e8: { going: ["u1", "u2", "u3", "u4", "u6", "u7", "u8", "u9", "u10", "u11", "u12"], maybe: ["u5"] },
  e9: { going: ["u1", "u2", "u3"] },
  e10: { going: ["u3", "u6", "u9", "u10"], maybe: ["u2"] },
  e11: { going: ["u1", "u4", "u7", "u11", "u12"], maybe: ["u2"] },
  e12: { going: ["u1", "u2", "u4", "u6", "u8", "u10"], maybe: ["u3", "u5", "u7", "u9", "u11", "u12"] },
};

export const rsvps: MockRsvp[] = Object.entries(rsvpSeed).flatMap(([eventId, groups]) => {
  const rows: MockRsvp[] = [];
  const respondedAt = daysFromNow(-2);
  for (const userId of groups.going ?? []) rows.push({ eventId, userId, status: "GOING", respondedAt });
  for (const userId of groups.maybe ?? []) rows.push({ eventId, userId, status: "MAYBE", respondedAt });
  for (const userId of groups.notGoing ?? []) rows.push({ eventId, userId, status: "NOT_GOING", respondedAt });
  return rows;
});

export function findRsvp(eventId: string, userId: string): MockRsvp | undefined {
  return rsvps.find((r) => r.eventId === eventId && r.userId === userId);
}

// ── Attendance (past events only) ───────────────────────────────────────

interface AttendanceSeed {
  eventId: string;
  attended: string[];
  late?: string[];
}

const attendanceSeed: AttendanceSeed[] = [
  { eventId: "e1", attended: ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10", "u15"], late: ["u9"] },
  { eventId: "e2", attended: ["u2", "u5", "u7", "u8", "u9", "u10"] },
  { eventId: "e3", attended: ["u3", "u6", "u9", "u10"] },
  { eventId: "e4", attended: ["u1", "u4", "u7", "u11", "u12"] },
  { eventId: "e5", attended: ["u2", "u7", "u8", "u10", "u12"] },
  { eventId: "e6", attended: ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u10", "u15"], late: ["u4", "u10"] },
];

export const attendances: MockAttendance[] = [];
export const ledgerEntries: MockLedgerEntry[] = [];

let attendanceIdCounter = 1;
let ledgerIdCounter = 1;

for (const seed of attendanceSeed) {
  const event = findEvent(seed.eventId)!;
  for (const userId of seed.attended) {
    const late = seed.late?.includes(userId) ?? false;
    const attendanceId = `att_${attendanceIdCounter++}`;
    attendances.push({
      id: attendanceId,
      eventId: seed.eventId,
      userId,
      checkInTime: late ? hoursAfter(event.startTime, 0.5) : event.startTime,
      method: "QR",
      late,
      pointsAwarded: event.pointValue,
      recordedById: null,
    });
    ledgerEntries.push({
      id: `ldg_${ledgerIdCounter++}`,
      userId,
      eventId: seed.eventId,
      semesterId: semester.id,
      amount: event.pointValue,
      type: "ATTENDANCE",
      reason: null,
      awardedById: null,
      createdAt: event.startTime,
    });
  }
}

// A few hand-authored bonus/penalty/manual-adjustment entries for realism —
// exactly the kind of thing an officer would do via the "Adjust Points" flow.
ledgerEntries.push(
  { id: `ldg_${ledgerIdCounter++}`, userId: "u7", semesterId: semester.id, amount: 5, type: "BONUS", reason: "Rush recruitment MVP — brought 3 new prospects to Info Night", awardedById: "u4", createdAt: daysFromNow(-8) },
  { id: `ldg_${ledgerIdCounter++}`, userId: "u13", semesterId: semester.id, amount: -10, type: "PENALTY", reason: "Missed mandatory chapter meeting without an excused absence", awardedById: "u1", createdAt: daysFromNow(-20) },
  { id: `ldg_${ledgerIdCounter++}`, userId: "u4", semesterId: semester.id, amount: 3, type: "MANUAL_ADJUSTMENT", reason: "QR scanner was down at Habitat build — confirmed attendance from photos", awardedById: "u5", createdAt: daysFromNow(-16) }
);

export function findAttendance(eventId: string, userId: string): MockAttendance | undefined {
  return attendances.find((a) => a.eventId === eventId && a.userId === userId);
}

// ── Event attendance-code delegation (Feature 3) ────────────────────────
// A committee head can't always attend their own event — they can delegate
// just the check-in-code generation to another member without granting
// them general attendance-management (Scribe) access. See
// usePermissions.canGenerateCheckIn.

export interface MockEventDelegate {
  eventId: string;
  userId: string;
}

export const eventDelegates: MockEventDelegate[] = [
  // Ethan (Service chair, u5) created Food Bank Volunteer Day but is out of
  // town that weekend — delegated check-in generation to Ava, a committee member.
  { eventId: "e7", userId: "u8" },
];

export function getEventDelegates(eventId: string): MockEventDelegate[] {
  return eventDelegates.filter((d) => d.eventId === eventId);
}

// ── Dues (Fall 2026 semester) ────────────────────────────────────────────

export const duesRecords: MockDuesRecord[] = [];
export const payments: MockPayment[] = [];
let duesIdCounter = 1;
let paymentIdCounter = 1;

// Pyli is the chapter's primary payment provider (self-service, member-
// initiated — see api/dues.ts payDuesWithPyli). Officer-recorded manual
// payments (cash/check/venmo received in person) still happen and don't
// carry a `plan`, since those are one-off, not a Pyli installment schedule.
const duesSeed: { userId: string; amountPaid: number; status: DuesStatus; method?: PaymentMethod; plan?: DuesPlan | null }[] = [
  { userId: "u1", amountPaid: 150, status: "PAID", method: "PYLI", plan: "FULL" },
  { userId: "u2", amountPaid: 150, status: "PAID", method: "VENMO" },
  { userId: "u3", amountPaid: 75, status: "PARTIAL", method: "PYLI", plan: "MONTHLY" },
  { userId: "u4", amountPaid: 150, status: "PAID", method: "PYLI", plan: "FULL" },
  { userId: "u5", amountPaid: 0, status: "UNPAID" },
  { userId: "u6", amountPaid: 100, status: "PARTIAL", method: "PYLI", plan: "MONTHLY" },
  { userId: "u7", amountPaid: 0, status: "UNPAID" },
  { userId: "u8", amountPaid: 0, status: "WAIVED" },
  { userId: "u9", amountPaid: 150, status: "PAID", method: "CHECK" },
  { userId: "u10", amountPaid: 50, status: "PARTIAL", method: "PYLI", plan: "MONTHLY" },
  { userId: "u11", amountPaid: 0, status: "UNPAID" },
  { userId: "u12", amountPaid: 0, status: "UNPAID" },
  { userId: "u13", amountPaid: 0, status: "UNPAID" },
  { userId: "u15", amountPaid: 150, status: "PAID", method: "PYLI", plan: "FULL" },
];

for (const seed of duesSeed) {
  const id = `dues_${duesIdCounter++}`;
  duesRecords.push({
    id,
    userId: seed.userId,
    semesterId: semester.id,
    amountOwed: 150,
    amountPaid: seed.amountPaid,
    status: seed.status,
    dueDate: daysFromNow(21, 23, 59),
    plan: seed.plan ?? null,
  });
  if (seed.amountPaid > 0 && seed.method) {
    payments.push({
      id: `pay_${paymentIdCounter++}`,
      duesRecordId: id,
      amount: seed.amountPaid,
      method: seed.method,
      paidAt: daysFromNow(-Math.floor(Math.random() * 15) - 1),
      // Pyli payments are self-service (member-initiated) — no officer
      // "recorded" them. Manual methods were recorded by the Treasurer.
      recordedById: seed.method === "PYLI" ? null : "u3",
    });
  }
}

export function findDuesRecord(userId: string, semesterId: string): MockDuesRecord | undefined {
  return duesRecords.find((d) => d.userId === userId && d.semesterId === semesterId);
}

// ── Committee Budgets & Expenses (Feature 5) ────────────────────────────
// Tracking only, per docs/DEMO_MODE.md — no real money moves. The
// Treasurer allocates a per-semester budget to each committee; chairs
// submit expenses against it; the Treasurer reviews and marks
// reimbursement status/method. "spent" and "pending" are derived at read
// time from expense status (see mocks/api.ts), not stored here.

export interface MockCommitteeBudget {
  committeeId: string;
  semesterId: string;
  allocated: number;
}

export const committeeBudgets: MockCommitteeBudget[] = [
  { committeeId: "c1", semesterId: semester.id, allocated: 800 },
  { committeeId: "c2", semesterId: semester.id, allocated: 600 },
  { committeeId: "c3", semesterId: semester.id, allocated: 500 },
  { committeeId: "c4", semesterId: semester.id, allocated: 1200 },
];

export function findCommitteeBudget(committeeId: string, semesterId: string): MockCommitteeBudget | undefined {
  return committeeBudgets.find((b) => b.committeeId === committeeId && b.semesterId === semesterId);
}

export interface MockExpense {
  id: string;
  committeeId: string;
  submittedById: string;
  amount: number;
  description: string;
  date: string;
  receiptLabel?: string | null;
  status: ReimbursementStatus;
  reimbursementMethod?: PaymentMethod | null;
  reimbursementNote?: string | null;
  reviewedById?: string | null;
  createdAt: string;
}

export const expenses: MockExpense[] = [];
let expenseIdCounter = 1;

const expenseSeed: Omit<MockExpense, "id" | "createdAt">[] = [
  { committeeId: "c1", submittedById: "u4", amount: 220, description: "Rush Info Night catering", date: daysFromNow(-9), receiptLabel: "receipt_infonight.jpg", status: "REIMBURSED", reimbursementMethod: "VENMO", reimbursementNote: "Paid same week", reviewedById: "u3" },
  { committeeId: "c1", submittedById: "u4", amount: 85, description: "Bid Night decorations and signage", date: daysFromNow(-2), receiptLabel: "receipt_bidnight_decor.jpg", status: "APPROVED", reviewedById: "u3" },
  { committeeId: "c2", submittedById: "u5", amount: 140, description: "Habitat build supplies — gloves, tarps, paint", date: daysFromNow(-17), receiptLabel: "receipt_habitat_supplies.jpg", status: "REIMBURSED", reimbursementMethod: "CASH", reviewedById: "u3" },
  { committeeId: "c2", submittedById: "u5", amount: 95, description: "Food Bank volunteer t-shirts (12 count)", date: daysFromNow(-1), receiptLabel: "receipt_tshirts.jpg", status: "SUBMITTED" },
  { committeeId: "c3", submittedById: "u6", amount: 60, description: "Resume workshop printing + snacks", date: daysFromNow(-12), receiptLabel: "receipt_workshop.jpg", status: "REIMBURSED", reimbursementMethod: "VENMO", reviewedById: "u3" },
  { committeeId: "c3", submittedById: "u6", amount: 300, description: "Networking mixer venue deposit", date: daysFromNow(-4), receiptLabel: "receipt_venue_deposit.jpg", status: "APPROVED", reviewedById: "u3" },
  { committeeId: "c4", submittedById: "u2", amount: 150, description: "Bowling night lane rental (4 lanes, 2hr)", date: daysFromNow(-5), receiptLabel: "receipt_bowling.jpg", status: "REIMBURSED", reimbursementMethod: "CHECK", reviewedById: "u3" },
  { committeeId: "c4", submittedById: "u2", amount: 400, description: "Founders Day Formal — DJ deposit", date: daysFromNow(-1), receiptLabel: "receipt_dj_deposit.jpg", status: "REJECTED", reimbursementNote: "Exceeds remaining committee budget this semester — resubmit after Q2 reallocation or split cost with chapter-wide budget.", reviewedById: "u3" },
];

for (const seed of expenseSeed) {
  expenses.push({ ...seed, id: `exp_${expenseIdCounter++}`, createdAt: seed.date });
}

export function findExpense(id: string): MockExpense | undefined {
  return expenses.find((e) => e.id === id);
}

// ── Channels & Messages ──────────────────────────────────────────────────

export const channels: MockChannel[] = [
  { id: "ch1", name: "#general", type: "GENERAL", committeeId: null },
  { id: "ch2", name: "#officers", type: "OFFICERS", committeeId: null },
  { id: "ch3", name: "#rush-committee", type: "COMMITTEE", committeeId: "c1" },
  { id: "ch4", name: "#service-committee", type: "COMMITTEE", committeeId: "c2" },
  { id: "ch5", name: "#professional-dev", type: "COMMITTEE", committeeId: "c3" },
  { id: "ch6", name: "#social-brotherhood", type: "COMMITTEE", committeeId: "c4" },
  { id: "ch7", name: "Sofia Nguyen", type: "DM", committeeId: null },
];

export const channelMemberships: MockChannelMembership[] = [
  ...users.map((u) => ({ channelId: "ch1", userId: u.id, role: "MEMBER" as ChannelMemberRole })),
  ...users.filter((u) => u.role !== "MEMBER").map((u) => ({ channelId: "ch2", userId: u.id, role: "MEMBER" as ChannelMemberRole })),
  ...committeeMemberships.filter((m) => m.committeeId === "c1").map((m) => ({ channelId: "ch3", userId: m.userId, role: "MEMBER" as ChannelMemberRole })),
  ...committeeMemberships.filter((m) => m.committeeId === "c2").map((m) => ({ channelId: "ch4", userId: m.userId, role: "MEMBER" as ChannelMemberRole })),
  ...committeeMemberships.filter((m) => m.committeeId === "c3").map((m) => ({ channelId: "ch5", userId: m.userId, role: "MEMBER" as ChannelMemberRole })),
  ...committeeMemberships.filter((m) => m.committeeId === "c4").map((m) => ({ channelId: "ch6", userId: m.userId, role: "MEMBER" as ChannelMemberRole })),
  { channelId: "ch7", userId: "u1", role: "MEMBER" },
  { channelId: "ch7", userId: "u2", role: "MEMBER" },
];

export const messages: MockMessage[] = [];
let messageIdCounter = 1;

function seedMessage(channelId: string, senderId: string, content: string, minutesAgo: number, pinned = false): void {
  messages.push({
    id: `msg_${messageIdCounter++}`,
    channelId,
    senderId,
    content,
    parentMessageId: null,
    pinned,
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  });
}

seedMessage("ch1", "u1", "Welcome back everyone! Fall 2026 semester is officially underway. Check your dues status on the Profile tab — deadline is in 3 weeks. Pay in full or monthly through Pyli, right from the app.", 60 * 24 * 6, true);
seedMessage("ch1", "u2", "Reminder: Big/Little Reveal is this Saturday at 7pm. RSVP on the Events tab if you haven't already!", 60 * 24 * 2);
seedMessage("ch1", "u5", "Food Bank volunteer shift got moved to 10am — updated on the event page.", 60 * 10);
seedMessage("ch1", "u9", "Does anyone have an extra chapter polo? Lost mine at the last mixer 😅", 45);

seedMessage("ch2", "u1", "Exec board meeting agenda: budget review, Rush Bid Night logistics, dues follow-up for the 5 members still unpaid.", 60 * 20);
seedMessage("ch2", "u3", "Pulled the numbers — we're at 62% dues collected chapter-wide, mostly via Pyli now. Full breakdown in the Admin panel. Also reviewing the DJ deposit expense from Social — it's over Social's remaining budget, following up with Sofia.", 60 * 18);
seedMessage("ch2", "u2", "I'll follow up with the Service and Professional Dev chairs about committee budgets this week.", 60 * 16);
seedMessage("ch2", "u15", "Attendance is caught up through this week's chapter meeting — 2 late check-ins, noted in each record. Ethan delegated check-in for Food Bank to Ava since he can't make it, so I don't need to be on-site for that one.", 60 * 14);

seedMessage("ch3", "u4", "Info Night went great — 40+ prospects showed up. Bid Night is set for the 19th.", 60 * 24 * 8);
seedMessage("ch3", "u7", "I can help run the sign-in table again for Bid Night.", 60 * 24 * 7);
seedMessage("ch3", "u11", "Excited for my first Bid Night on this side of things!", 60 * 24 * 3);

seedMessage("ch4", "u5", "Habitat build was a huge success — thanks to everyone who came out. 6 brothers logged hours.", 60 * 24 * 16);
seedMessage("ch4", "u8", "Food Bank sign-up sheet is open, we need at least 8 people for the Tuesday shift.", 60 * 24 * 1);

seedMessage("ch5", "u6", "Resume workshop feedback was really positive — planning a mock interview night next month.", 60 * 24 * 11);
seedMessage("ch5", "u10", "Networking mixer RSVPs are looking good, 10+ alumni confirmed.", 60 * 60 * 5);

seedMessage("ch6", "u2", "Founders Day Formal tickets go live next week — save the date, semi-formal attire.", 60 * 24 * 4);
seedMessage("ch6", "u7", "Bowling night was a blast, we should do that again before finals.", 60 * 24 * 4.5);

seedMessage("ch7", "u2", "Hey — can you approve the Service Committee's budget request when you get a sec?", 60 * 5);
seedMessage("ch7", "u1", "Yep, just approved it. Nice work getting the Habitat build numbers up.", 60 * 4);

export function findMessage(id: string): MockMessage | undefined {
  return messages.find((m) => m.id === id);
}
