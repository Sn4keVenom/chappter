# ChapterHub — Roles, Offices, Permissions & Modules

This is the reference for the permission system introduced in the
foundational architecture expansion. Source of truth for all of it is code,
not this document — if they ever disagree, trust the code and update this
file:

- `src/types/index.ts` — `UserRole`, `ExecOffice`, `MemberStatus`,
  `ALL_PERMISSIONS`, `ModuleKey`
- `src/permissions/permissions.ts` — default role presets, `hasPermission()`,
  `hasScopedManagementAccess()` / `hasAnyManagementAccess()` (committee-chair
  scoping)
- `src/hooks/usePermissions.ts` — client-side gating (mirrors the server)
- `src/mocks/api.ts` — server-side enforcement in Demo Mode
- `backend/middleware/rbac.ts` + `backend/routes/*.ts` — server-side
  enforcement against the real backend (**narrower** than the mock — see
  "Backend parity gap" below)

## Member Status vs. Role vs. Office

Three independent fields on `User`, deliberately not derived from one
another:

| Field | What it answers | Values |
|---|---|---|
| `status` (`MemberStatus`) | Where is this person in the membership lifecycle? | `ACTIVE`, `PNM`, `ALUMNI`, `INACTIVE` |
| `role` (`UserRole`) | What permission preset applies to them? | `SUPER_ADMIN`, `EXEC`, `MEMBER`, `PNM`, `ALUMNI` |
| `office` (`ExecOffice \| null`) | What named position do they hold (Exec only, cosmetic)? | `REGENT`, `VICE_REGENT`, `TREASURER`, `SCRIBE`, `MARSHAL`, `CORRESPONDING_SECRETARY`, `NEW_MEMBER_EDUCATOR` |

They usually correlate (a `PNM`-status person is usually `PNM`-role) but a
Super Admin can set any combination — e.g. an Alumni-status brother who
still needs Exec-level access during an officer transition.

`INACTIVE` status has no corresponding role tier — an inactive member keeps
whatever role they had (usually `MEMBER`); it's a temporary/disciplinary
status, not a separate membership category the way PNM/Alumni are.

## Permissions

Flat, namespaced strings (`module.action`) — see `ALL_PERMISSIONS` in
`src/types/index.ts` for the exact list. Grouped by module:

| Group | Permissions |
|---|---|
| Events | `events.view`, `events.create`, `events.edit`, `events.delete` |
| Attendance | `attendance.view`, `attendance.take`, `attendance.edit` |
| Documents | `documents.view`, `documents.upload`, `documents.delete` |
| Points | `points.award`, `points.deduct` |
| Messaging | `messaging.post`, `messaging.moderate` |
| Committees | `committees.manage` |
| Finance | `dues.manage`, `finance.manage` |
| Teams | `teams.manage` |
| Feedback | `feedback.view`, `feedback.manage` |
| Chapter Administration | `users.manage`, `settings.manage`, `modules.manage`, `permissions.manage` |

**Roles are just presets over this list** — a Super Admin can grant or
revoke any permission for any role (except `SUPER_ADMIN` itself, which
always has everything and can't be edited, so it can never be
misconfigured into a lockout) from Admin → Chapter Administration →
Permissions.

Default presets ship in `src/permissions/permissions.ts`
(`DEFAULT_ROLE_PRESETS`) and are seeded into the mutable store on first
boot — see `src/mocks/seed.ts` `rolePermissions` (Demo Mode) or
`RolePermission` table (real backend, seed it via `backend/prisma/seed.ts`
before going live).

## Committee-chair scoping (separate from the permission table)

Chairing a committee grants scoped management rights (edit that committee,
manage its events/attendance/budget) **independent of role/permission
presets** — this is data-driven (checked against `CommitteeMembership.role
= CHAIR`), not part of the permission table, and only applies to
`ACTIVE`-status members. See `hasScopedManagementAccess()` /
`hasAnyManagementAccess()` in `src/permissions/permissions.ts`.

## Modules

Whole app sections can be toggled off chapter-wide (Admin → Chapter
Administration → Modules). Disabling one hides its tab/nav entry and its
AdminPanel section everywhere, immediately, for every user:

`events`, `attendance`, `messaging`, `documents`, `points`, `calendar`,
`feedback`, `committees`, `dues`, `teams`, plus two inert placeholders
(`officeInventory`, `attendanceRaffles`) proving the system extends to
features that don't have screens yet.

## Backend parity gap (important — read before relying on this in production)

The **mock backend** (`src/mocks/api.ts`, used in Demo Mode) implements the
full granular permission system described above — every route checks
`hasPermission()` against the live, editable preset map.

The **real Express backend** (`backend/routes/*.ts`) has routes for
everything (`settings.routes.ts`, `modules.routes.ts`,
`documents.routes.ts`, `feedback.routes.ts`, `permissions.routes.ts` all
exist and persist to real tables), **but authorization on the *existing*
resources (events, dues, committees, attendance, messages, users) still
uses a flat role-tier check** (`backend/middleware/rbac.ts`
`requireRole`/`isAtLeast`, tiers: `PNM`/`ALUMNI`/`MEMBER` = 0, `EXEC` = 1,
`SUPER_ADMIN` = 2) plus `requireCommitteeScope` for chair-scoped routes,
not a lookup against the `RolePermission` table those permissions routes
write to. Concretely:

- `PATCH /permissions/:role` **does** persist an edit to the
  `RolePermission` table for real.
- But no other route reads that table back to decide who's authorized —
  they're still hardcoded to `requireRole("EXEC")` and similar. So editing
  a role's permissions in the Permissions screen changes what's *stored*,
  with **no effect** on what's actually *enforced* against the real
  backend (Demo Mode is unaffected by this gap — its mock routes always
  read live from the map).
- The real backend is also *more* restrictive than the mock's default
  presets in a few specific places inherited from before this permission
  system existed (e.g. only Exec+ can pin/delete messages server-side,
  where the mock also allows a committee chair via
  `hasAnyManagementAccess`) — see the comments in `messages.routes.ts` and
  `attendance.routes.ts` for the specific spots.

**Before relying on custom permission edits in production**, add a
`requirePermission(permission)` middleware (parallel to `requireRole`) that
queries `RolePermission` for `req.user.role` and checks membership —
mirroring `src/permissions/permissions.ts` `hasPermission()` — then swap
each route's `requireRole(...)` guard for the specific permission it
actually represents (the mapping is already documented in the "Permissions"
table above). This is the single largest remaining gap between "what the
UI implies you can configure" and "what's actually enforced server-side"
— see the production-readiness audit report for the full writeup.
