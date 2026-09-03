// src/mocks/router.ts
//
// A custom axios `adapter` that answers every request from local mock data
// instead of the network. Installed onto the shared `apiClient` instance in
// api/client.ts only when DEMO_MODE is true (see src/config/demo.ts) — every
// other file (all of src/api/*.ts, every screen, every store) is completely
// unaware this exists. They call apiClient.get/post/patch/delete exactly as
// they would against the real backend; axios's own request/response
// interceptors still run unchanged (see api/client.ts), so ApiError handling
// in screens works identically in demo and live mode.
//
// Route table mirrors backend/routes/*.ts one-for-one — same paths, same
// response envelopes — so this file is also a reasonably complete map of
// the full backend API surface.

import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import * as api from "./api";
import { DemoApiError } from "./api";

type Handler = (params: Record<string, string>, query: Record<string, any>, body: any) => unknown;

interface Route {
  method: string;
  segments: string[]; // e.g. ["events", ":id", "rsvp"]
  handler: Handler;
}

const routes: Route[] = [];

function seg(pattern: string): string[] {
  return pattern.split("/").filter(Boolean);
}

function route(method: string, pattern: string, handler: Handler): void {
  routes.push({ method, segments: seg(pattern), handler });
}

function matchRoute(method: string, url: string): { route: Route; params: Record<string, string> } | null {
  const path = url.split("?")[0];
  const urlSegments = seg(path);
  for (const r of routes) {
    if (r.method !== method) continue;
    if (r.segments.length !== urlSegments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < r.segments.length; i++) {
      const p = r.segments[i];
      const u = decodeURIComponent(urlSegments[i]);
      if (p.startsWith(":")) params[p.slice(1)] = u;
      else if (p !== u) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

// ── Route table ──────────────────────────────────────────────────────────
// Literal paths are listed ahead of their wildcard siblings of the same
// segment length (e.g. "/users/me" before "/users/:id") so they win the match.

// Auth (not called in Demo Mode — login is bypassed — kept for completeness)
route("post", "/auth/sync", () => ({ user: api.getMe() }));

// Events
route("get", "/events", (_p, q) => ({ events: api.listEvents(q) }));
route("post", "/events", (_p, _q, body) => ({ event: api.createEvent(body) }));
route("get", "/events/:id/checkin-token", (p) => api.getCheckInToken(p.id));
route("post", "/events/:id/checkin-code", (p, _q, body) => api.setCheckInCode(p.id, body.code));
route("get", "/events/:id/attendance", (p) => api.getEventRoster(p.id));
route("get", "/events/:id", (p) => ({ event: api.getEvent(p.id) }));
route("post", "/events/:id/rsvp", (p, _q, body) => {
  api.setRsvp(p.id, body.status);
  return {};
});
route("post", "/events/:id/checkin", (p, _q, body) => api.selfCheckIn(p.id, body));
route("post", "/events/:id/attendance/:userId", (p, _q, body) => api.manualMarkAttendance(p.id, p.userId, body));
route("post", "/events/:id/delegates", (p, _q, body) => ({ delegates: api.addEventDelegate(p.id, body.userId) }));
route("delete", "/events/:id/delegates/:userId", (p) => ({ delegates: api.removeEventDelegate(p.id, p.userId) }));

// Users / points
route("get", "/users/me/dashboard", () => api.getDashboard());
route("get", "/users/me", () => ({ user: api.getMe() }));
route("patch", "/users/me", (_p, _q, body) => ({ user: api.updateMyProfile(body) }));
route("get", "/users/:id/family", (p) => api.getFamily(p.id));
route("patch", "/users/:id/big", (p, _q, body) => ({ membership: api.setBig(p.id, body.bigUserId) }));
route("patch", "/users/:id/role-number", (p, _q, body) => ({ membership: api.setRoleNumber(p.id, body.roleNumber) }));
// Before /users/:id below — ":id" matches the literal "search" too, and
// matchRoute() takes the first registration-order match (see its doc
// comment above), same hazard as the real Express router.
route("get", "/users/search", (_p, q) => ({ users: api.searchMembers(q.q ?? "") }));
route("get", "/users/:id", (p) => ({ user: api.getMemberProfile(p.id) }));
route("get", "/users", (_p, q) => api.getRoster(q));
route("patch", "/users/:id/role", (p, _q, body) => ({ user: api.updateUserRole(p.id, body.role) }));
route("patch", "/users/:id", (p, _q, body) => ({ user: api.updateUserFields(p.id, body) }));
route("delete", "/users/:id", (p) => api.deleteMemberAccount(p.id));
route("get", "/points/leaderboard", (_p, q) => api.getLeaderboard());
route("get", "/points/ledger/:userId", (p, q) => api.getPointsLedger(p.userId, q));
route("post", "/points/adjust", (_p, _q, body) => ({ entry: api.adjustPoints(body) }));

// Attendance
route("get", "/attendance/history/:userId", (p) => api.getMemberAttendanceHistory(p.userId));
route("get", "/attendance/history", (_p, q) => api.getMyAttendanceHistory(q));

// Teams (Feature 2 — gamification groupings, not committees)
route("get", "/teams/leaderboard", () => api.getTeamLeaderboard());
route("get", "/teams", () => ({ teams: api.listTeams() }));
route("post", "/teams", (_p, _q, body) => ({ team: api.createTeam(body) }));
route("get", "/teams/:id", (p) => ({ team: api.getTeam(p.id) }));
route("delete", "/teams/:id", (p) => {
  api.deleteTeam(p.id);
  return { deleted: true };
});
route("post", "/teams/:id/members", (p, _q, body) => ({ team: api.addTeamMember(p.id, body.userId) }));
route("delete", "/teams/:id/members/:userId", (p) => ({ team: api.removeTeamMember(p.id, p.userId) }));

// Committees
route("get", "/committees", () => ({ committees: api.listCommittees() }));
route("post", "/committees", (_p, _q, body) => ({ committee: api.createCommittee(body) }));
route("get", "/committees/:id", (p) => ({ committee: api.getCommittee(p.id) }));
route("patch", "/committees/:id", (p, _q, body) => ({ committee: api.updateCommittee(p.id, body) }));
route("delete", "/committees/:id", (p) => api.deleteCommittee(p.id));
route("post", "/committees/:id/members", (p, _q, body) => ({ membership: api.addCommitteeMember(p.id, body) }));
route("delete", "/committees/:id/members/:userId", (p) => {
  api.removeCommitteeMember(p.id, p.userId);
  return {};
});

// Messaging
route("get", "/channels", (_p, q) => ({ channels: api.listChannels(q) }));
route("post", "/channels", (_p, _q, body) => ({ channel: api.createChannel(body) }));
route("patch", "/channels/:id/archive", (p, _q, body) => ({ channel: api.setChannelArchived(p.id, body.archived) }));
route("get", "/channels/:id/messages/:messageId/thread", (p) => api.getThread(p.id, p.messageId));
route("get", "/channels/:id/messages", (p, q) => api.getChannelMessages(p.id, q));
route("post", "/channels/:id/messages", (p, _q, body) => ({ message: api.sendMessage(p.id, body) }));
route("patch", "/messages/:id/pin", (p, _q, body) => ({ message: api.pinMessage(p.id, body.pinned) }));
route("delete", "/messages/:id", (p) => {
  api.deleteMessage(p.id);
  return {};
});

// Achievements (chapter-customizable badges)
route("get", "/achievements", () => ({ achievements: api.listAchievements() }));
route("post", "/achievements/reset", () => ({ achievements: api.resetAchievements() }));
route("post", "/achievements", (_p, _q, body) => ({ achievement: api.createAchievement(body) }));
route("patch", "/achievements/:id", (p, _q, body) => ({ achievement: api.updateAchievement(p.id, body) }));
route("delete", "/achievements/:id", (p) => api.deleteAchievement(p.id));

// Dues
route("get", "/dues/me", () => ({ records: api.getMyDues() }));
route("get", "/dues", (_p, q) => api.getAllDues(q));
route("post", "/dues/initialize", (_p, _q, body) => api.initializeSemesterDues(body));
route("post", "/dues/reminders/send", (_p, _q, body) => api.sendDuesReminders(body.semesterId));
route("post", "/dues/pay-pyli", (_p, _q, body) => api.payDuesWithPyli(body));
route("post", "/dues/:userId/payment", (p, _q, body) => api.recordPayment(p.userId, body));
route("patch", "/dues/:userId", (p, _q, body) => ({ record: api.updateMemberDues(p.userId, body) }));
route("post", "/dues/:userId/waive", (p, _q, body) => api.waiveDues(p.userId, body.semesterId, body.reason));

// Committee budgets & reimbursements (Feature 5 — tracking only)
route("get", "/budgets", () => ({ budgets: api.listCommitteeBudgets() }));
route("get", "/committees/:id/budget", (p) => ({ budget: api.getCommitteeBudget(p.id) }));
route("patch", "/committees/:id/budget", (p, _q, body) => ({ budget: api.setCommitteeBudget(p.id, body) }));
route("get", "/expenses", (_p, q) => ({ expenses: api.listExpenses(q) }));
route("post", "/expenses", (_p, _q, body) => ({ expense: api.submitExpense(body) }));
route("patch", "/expenses/:id", (p, _q, body) => ({ expense: api.updateExpenseStatus(p.id, body) }));

// Permissions (spec §3)
route("get", "/permissions", () => ({ roles: api.getRolePermissions() }));
route("patch", "/permissions/:role", (p, _q, body) => ({ role: api.updateRolePermissions(p.role as any, body.permissions) }));
route("get", "/permissions/offices", () => ({ offices: api.getOfficePermissions() }));
route("patch", "/permissions/offices/:office", (p, _q, body) => ({ office: api.updateOfficePermissions(p.office as any, body.permissions) }));

// Chapters, invites & join requests (account-system spec §3) — every demo
// user already has a chapter, so only the admin management screens
// (reachable from AdminPanelScreen) exercise these; the join/onboarding
// flow itself is never reached in Demo Mode.
route("get", "/chapters", () => ({ chapters: api.listChapters() }));
route("post", "/chapters/:id/invites", (p, _q, body) => ({ invite: api.createInvite(p.id, body) }));
route("get", "/chapters/:id/invites", (p) => ({ invites: api.getInvites(p.id) }));
route("patch", "/chapters/:id/invites/:inviteId", (p, _q, body) => ({ invite: api.updateInvite(p.id, p.inviteId, body) }));
// Archive keeps the existing DELETE verb the backend already exposes; the
// restore/regenerate siblings are new (see src/api/branding.ts's note about
// routes the real server hasn't shipped yet).
route("delete", "/chapters/:id/invites/:inviteId", (p) => ({ invite: api.revokeInvite(p.id, p.inviteId) }));
route("post", "/chapters/:id/invites/:inviteId/restore", (p) => ({ invite: api.restoreInvite(p.id, p.inviteId) }));
route("post", "/chapters/:id/invites/:inviteId/regenerate", (p) => ({ invite: api.regenerateInvite(p.id, p.inviteId) }));

// Chapter branding (visual identity — see src/theme/palette.ts)
route("get", "/chapters/:id/branding", (p) => ({ branding: api.getChapterBranding(p.id) }));
route("patch", "/chapters/:id/branding", (p, _q, body) => ({ branding: api.updateChapterBranding(p.id, body) }));
route("post", "/chapters/:id/branding/reset", (p) => ({ branding: api.resetChapterBranding(p.id) }));
route("get", "/chapters/:id/join-requests", (p, q) => ({ joinRequests: api.getJoinRequests(p.id, q.status ?? "PENDING") }));
route("patch", "/chapters/join-requests/:id", (p, _q, body) => ({ joinRequest: api.reviewJoinRequest(p.id, body.approve) }));
route("get", "/chapters/:id/roster-entries", (p) => ({ rosterEntries: api.getRosterEntries(p.id) }));
route("post", "/chapters/:id/roster-entries", (p, _q, body) => ({ rosterEntry: api.createRosterEntry(p.id, body) }));
route("post", "/chapters/:id/roster-entries/bulk", (p, _q, body) => api.bulkCreateRosterEntries(p.id, body.entries ?? []));
route("delete", "/chapters/:id/roster-entries/:entryId", (p) => {
  api.deleteRosterEntry(p.id, p.entryId);
  return {};
});

// Modules (spec §5)
route("get", "/modules", () => ({ modules: api.getModules() }));
route("patch", "/modules/:key", (p, _q, body) => ({ module: api.setModuleEnabled(p.key as any, body.enabled) }));

// Chapter settings (spec §6)
route("get", "/settings", () => ({ settings: api.getChapterSettings() }));
route("patch", "/settings", (_p, _q, body) => ({ settings: api.updateChapterSettings(body) }));

// Documents, folders & external links (spec §8)
route("get", "/document-folders", () => ({ folders: api.listDocumentFolders() }));
route("post", "/document-folders", (_p, _q, body) => ({ folder: api.createDocumentFolder(body.name) }));
route("patch", "/document-folders/:id", (p, _q, body) => ({ folder: api.renameDocumentFolder(p.id, body.name) }));
route("delete", "/document-folders/:id", (p) => {
  api.deleteDocumentFolder(p.id);
  return { deleted: true };
});
route("get", "/documents", (_p, q) => ({ documents: api.listDocuments(q) }));
route("post", "/documents", (_p, _q, body) => ({ document: api.uploadDocument(body) }));
route("delete", "/documents/:id", (p) => {
  api.deleteDocument(p.id);
  return {};
});
route("get", "/links", () => ({ links: api.listExternalLinks() }));
route("post", "/links", (_p, _q, body) => ({ link: api.createExternalLink(body) }));
route("delete", "/links/:id", (p) => {
  api.deleteExternalLink(p.id);
  return {};
});

// Audit log (hardening item §3)
route("get", "/audit-log", (_p, q) => api.getAuditLog(q));

// Feedback & bug reports (spec §9)
route("get", "/feedback", (_p, q) => ({ reports: api.listFeedback(q) }));
route("post", "/feedback", (_p, _q, body) => ({ report: api.submitFeedback(body) }));
route("patch", "/feedback/:id", (p, _q, body) => ({ report: api.updateFeedbackStatus(p.id, body.status) }));

// ── Adapter plumbing ─────────────────────────────────────────────────────

function delay(): Promise<void> {
  // A little artificial latency so loading spinners, pull-to-refresh, and
  // optimistic-update code paths behave the same as they would against a
  // real network call, instead of resolving instantly.
  const ms = 180 + Math.floor(Math.random() * 220);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBody(data: unknown): any {
  if (data == null) return {};
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  // A real file upload (documents/receipts — see api/documents.ts
  // uploadDocument) sends FormData, not JSON. Flatten it to a plain object
  // so route handlers can read `body.name`/`body.file` etc. like any other
  // field — a File entry survives this untouched (still a real File, just
  // reachable by property access instead of FormData.get()).
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of data.entries()) obj[key] = value;
    return obj;
  }
  return data;
}

function ok(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
    request: {},
  };
}

function fail(config: InternalAxiosRequestConfig, status: number, message: string, code?: string): never {
  const err: any = new Error(message);
  err.isAxiosError = true;
  err.config = config;
  err.response = {
    data: { error: message, ...(code ? { code } : {}) },
    status,
    statusText: "",
    headers: {},
    config,
  };
  throw err;
}

export async function demoAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  await delay();

  const method = (config.method ?? "get").toLowerCase();
  const url = config.url ?? "";
  const matched = matchRoute(method, url);

  if (!matched) {
    fail(config, 404, `No demo-mode mock for ${method.toUpperCase()} ${url}`);
  }

  try {
    const result = matched.route.handler(
      matched.params,
      (config.params as Record<string, any>) ?? {},
      parseBody(config.data)
    );
    return ok(config, result);
  } catch (e) {
    if (e instanceof DemoApiError) {
      fail(config, e.status, e.message, e.code);
    }
    // Any unexpected error in a mock handler is a bug in the mock, not a
    // "real" 4xx — surface it as a 500 so it's obvious during development.
    fail(config, 500, e instanceof Error ? e.message : "Demo mock error");
  }
}
