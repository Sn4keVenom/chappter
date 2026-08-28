# Changelog

All notable changes to Chappter are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [1.4.0] — 2026-07-09 — Production Readiness Audit

Full-stack audit ahead of real-chapter deployment. See the audit report
delivered alongside this release for the complete findings; highlights:

### Fixed (critical)
- **Every backend route handler is now wrapped in `asyncHandler`**
  (`backend/lib/asyncHandler.ts`). Express 4 doesn't forward a rejected
  Promise from an async route to the error middleware — any unexpected
  error (bad Prisma input, a dropped connection) previously hung the
  request and could crash the whole process via an unhandled rejection.
  Now it cleanly 500s.
- Removed a stale reference to the deleted `OFFICER` role in
  `events.routes.ts` that silently let DRAFT events leak to PNM/Alumni
  members (comparing against `undefined` always evaluated false).
- Seven admin screens (Chapter Settings, Modules, Permissions, Points
  Adjust, Dues Detail, Committee Budgets, Roster) had no internal
  permission check — reachable by any authenticated user via direct
  navigation, not just the button that was supposed to gate them. All now
  self-gate with a shared `RequireAccess` component.
- Real Clerk session restoration on cold start (`SessionRestore.tsx`) —
  previously every force-quit/reopen forced a fresh login even with a
  valid cached session.
- Dead check-in counter in `CheckInScreen.tsx` (empty polling interval,
  count permanently stuck at 0) now actually polls attendance count.

### Added
- `backend/lib/env.ts` — fails fast at boot with a clear message if
  `DATABASE_URL`/`CLERK_SECRET_KEY` are missing, instead of a cryptic
  runtime error on first request.
- `helmet`, `morgan`, `express-rate-limit` on the backend — security
  headers, request logging, and rate limiting (600 req/15min general,
  30 req/15min on `/auth`).
- `/health` now verifies DB connectivity (`SELECT 1`) instead of just
  process liveness.
- Graceful shutdown on SIGTERM/SIGINT — drains in-flight requests and
  closes the Prisma pool before exiting.
- `src/components/ErrorBoundary.tsx` — top-level React error boundary;
  previously any uncaught render error blanked the whole app.
- `src/components/RequireAccess.tsx` — shared screen-level access guard.
- Automatic retry-once for idempotent GET requests on network error/5xx
  (`src/api/client.ts`) — mobile networks drop packets constantly.
- Real backend routes for five features that previously only existed in
  the Demo Mode mock: `settings.routes.ts`, `modules.routes.ts`,
  `documents.routes.ts`, `feedback.routes.ts`, `permissions.routes.ts`.
- `docs/PERMISSIONS.md` — full reference for roles/offices/permissions/
  modules, including the documented gap between what's editable and
  what's enforced server-side.
- New Prisma indexes (`Event(status, startTime)`, `DuesRecord(semesterId)`)
  for the query patterns every list endpoint actually uses.

### Changed
- CORS now requires an explicit origin allowlist in production instead of
  silently falling back to `*` (which is also incompatible with
  `credentials: true` in every browser anyway).
- `KeyboardAvoidingView` added to the three modals where the keyboard
  could previously cover the Save button entirely (Dues payment/waive,
  committee budget edit, attendance override reason).
- Removed unused `expo-status-bar` dependency.

### Known gaps (documented, not fixed this pass — see audit report)
- The real backend's new Permissions routes persist edits, but no other
  route reads them back for authorization yet — every route still checks
  a flat role tier. Demo Mode is unaffected (its mocks always read live).
- No multi-tenancy — this schema is one chapter per deployed database, not
  many chapters sharing one backend (see `ChapterSettings` doc comment in
  `schema.prisma`).
- `prisma/migrations/` needs a fresh `prisma migrate dev` against a real
  Postgres instance before deploying — the schema has changed substantially
  since the committed `init` migration and this environment had no
  database available to generate/verify one safely.
- No automated tests exist at any level (unit/integration/E2E).
- Zero accessibility props (`accessibilityLabel`/`accessibilityRole`)
  anywhere in the mobile app.

---

## [1.3.0] — 2026-07-08 — Roles, Permissions, Modules & Chapter Settings

Foundational pre-release architecture expansion.

### Added
- Granular permission system (`src/permissions/permissions.ts`) — roles
  are mutable permission presets instead of hardcoded tier checks, editable
  at runtime by a Super Admin (`admin/PermissionsScreen.tsx`).
- Member statuses replaced with `ACTIVE`/`PNM`/`ALUMNI`/`INACTIVE`; roles
  replaced with `SUPER_ADMIN`/`EXEC`/`MEMBER`/`PNM`/`ALUMNI` (the `OFFICER`
  tier removed — committee chairs are tracked via committee membership,
  independent of role).
- Independent Exec Office field (Regent, Vice Regent, Treasurer, Scribe,
  Marshal, Corresponding Secretary, New Member Educator) — decoupled from
  both role and permissions.
- Module/feature toggle system (`admin/ModulesScreen.tsx`) — disables
  whole app sections chapter-wide.
- Chapter Settings (`admin/ChapterSettingsScreen.tsx`) — centralized
  chapter name/semester/dues/attendance/points configuration.
- Documents & external links module, Feedback & bug report module.
- Calendar integration — Google/Outlook web links, ICS export, and real
  on-device Apple/Android calendar writes via `expo-calendar`.

## [1.2.0] — 2026-07-08 — Points, Teams, Delegation, Dues & Budgets

### Added
- Individual point breakdowns and leaderboard, plus gamification Teams
  (distinct from committees) with a team leaderboard.
- Event attendance-code delegation — an organizer who can't attend can
  delegate check-in-code generation for a single event.
- Pyli self-service dues payment (Full/Monthly plans).
- Committee budgets & expense reimbursement workflow (Treasurer/chair).

---

## [1.1.0] — 2026-07-08 — Demo Mode

The app now launches directly into a fully interactive Demo Mode by
default — `npm install && npm start`, no Clerk account, no PostgreSQL, no
Express backend, no `.env` file at all. See
[docs/DEMO_MODE.md](docs/DEMO_MODE.md).

### Added
- `src/config/demo.ts` — `DEMO_MODE` flag, on unless
  `EXPO_PUBLIC_DEMO_MODE=false` is explicitly set.
- `src/mocks/` — a complete mock backend: `seed.ts` (14 users across every
  role/status, 4 committees, 12 events past/upcoming, a full points ledger,
  dues records in every status, 7 channels with message history),
  `api.ts` (business logic mirroring every real backend route),
  `router.ts` (a custom axios `adapter` installed on the shared `apiClient`
  instance so every existing `src/api/*.ts` function and the one direct
  `apiClient.post` call in `CreateEventScreen` are intercepted with **zero
  changes to any call site**), `identity.ts` / `bootstrap.ts` (demo user
  session + role switcher).
- `App.tsx` skips `ClerkProvider` and the required-env-var check entirely
  in Demo Mode; `bootstrapDemoSession()` pre-populates `useAuthStore`
  before the first render so `RootNavigator` routes straight past Login.
- `src/hooks/useAppAuth.ts` — wraps Clerk's `useAuth()` so `ProfileScreen`
  doesn't crash with "No Clerk context found" when `ClerkProvider` isn't
  mounted (demo mode has no provider in the tree at all).
- A "Demo Mode — viewing as ___" banner + role switcher in `ProfileScreen`,
  cycling between four representative mock users (one per role) so
  role-gated UI (Admin tab, dues management, committee scope) can be
  evaluated without a real account per role.
- `src/utils/achievements.ts` — client-side-only achievement badges
  computed from data the app already fetches (points, attendance, dues,
  committees). Not a backend concept; works in both demo and live mode.
- Real implementations for four screens that were previously blank
  `() => null` stubs *but reachable via existing buttons*
  (Leaderboard/Committee/Admin rows navigated to them and showed nothing):
  `MemberProfileScreen`, `PointsAdjustScreen`, `RosterDetailScreen`,
  `DuesDetailScreen`. `AdminPanelScreen`'s "Send Reminders" button
  previously showed a fake success alert without calling the API — now
  calls `sendDuesReminders()` for real.
- `NotImplementedScreen` and `MapViewScreen` replace the remaining blank
  stubs (`AuditLog`, `Thread`, `MapView`) with an honest state instead of a
  blank screen — none of the three has real backend/SDK support to mock
  faithfully (no audit-log endpoint exists anywhere, nothing links to
  Thread, no map SDK is installed).

### Fixed
- **Critical, pre-existing: the app could not launch on a real device or
  simulator at all**, in demo mode or live mode. Root `package.json`'s
  `"main"` field pointed directly at `App.tsx` instead of Expo's
  `node_modules/expo/AppEntry.js` entry shim, so `registerRootComponent()`
  was never called and the native "main" component never registered —
  every launch failed with "App entry point named 'main' was not
  registered." This was invisible to `tsc` and `expo export` (both static
  analysis, neither actually boots the app) and was only caught by
  launching the app in a real iOS Simulator. Fixed by pointing `"main"` at
  the standard Expo entry shim.

---

## [1.0.1] — 2026-07-07 — Dependency Repair & Release Hardening

Full audit of every config file, dependency version, and import path. The
project now installs and runs cleanly on a fresh clone. See
[FINAL-VALIDATION.md](FINAL-VALIDATION.md) for the full verification report.

### Changed — Dependency baseline
- Standardized on a single, consistent generation: **Expo SDK 57**, **React
  19.2.3**, **React Native 0.86.0**, **React Navigation v7**, **TypeScript 6**.
  Previous exports mixed SDK 51/56 packages with incompatible peer versions.
- `@clerk/clerk-expo` moved off the nonexistent `^1.3.0` to `^2.19.41` (the
  latest version *not* covered by [GHSA-w24r-5266-9c3c](https://github.com/advisories/GHSA-w24r-5266-9c3c),
  a high-severity authorization-bypass advisory affecting `2.2.11–2.19.35`,
  including npm's `latest`-tagged `2.19.31`).
- `@clerk/backend` moved to `^3.11.1`; `@prisma/client`/`prisma` pinned to
  `6.19.3` (Prisma 7 requires driver adapters and a `prisma.config.ts`
  rewrite — a breaking schema change out of scope for a dependency repair).
- `express` pinned to `^4.22.2` (stayed on 4.x rather than 5.x to avoid an
  unreviewed behavioral migration of every route file).
- `zod` pinned to `^3.25.76` (stayed on 3.x — v4 renames several APIs the
  route validators depend on, e.g. `z.string().datetime()`).
- `stripe` upgraded to `^22.3.0`; the webhook's pinned `apiVersion` literal
  updated from the no-longer-valid `"2024-06-20"` to `"2026-06-24.dahlia"`.
- Replaced unmaintained `ts-node-dev` (last published 2022) and `ts-node`
  with `tsx` for the backend dev server, seed script, and admin script.
- Removed `@types/react-native`, a deprecated stub package — React Native
  ships its own types since 0.71.
- Added `expo-auth-session`, `expo-web-browser` (required, non-optional
  peers of `@clerk/clerk-expo`'s SSO flow), `expo-splash-screen` (SDK 57
  moved splash config out of `app.json` and into this plugin), and
  `react-dom` (required peer of `@clerk/clerk-expo`, even for phone-only
  apps — flagged by `expo-doctor` as a potential standalone-build crash).
- Removed the `web` key from `app.json` and the `web` npm script — this is a
  phone-only app; no Expo web/Electron/desktop target.

### Fixed — Real bugs found via typecheck/lint, not just version bumps
- **Critical: authentication was completely broken.** `backend/middleware/auth.ts`
  and `backend/routes/auth.routes.ts` called `clerk.verifyToken(token)` on a
  `createClerkClient()` instance — that method doesn't exist on the client;
  `verifyToken` is a standalone export of `@clerk/backend`. Every request,
  even with a perfectly valid Clerk JWT, threw and was caught by the
  surrounding `try/catch`, always returning 401. No user could ever log in.
  Fixed to `import { verifyToken } from "@clerk/backend"` called directly.
- **Structural bug: `prisma generate` corrupted the mobile app's `package.json`.**
  `prisma/` lived at the repo root as a sibling of `backend/`. Prisma's
  auto-install-missing-deps logic resolves relative to the schema file's own
  directory, not the CWD — so it silently installed `@prisma/client`/`prisma`
  into the **mobile app's** `package.json` on every `db:generate`. Same root
  cause broke `scripts/promote-admin.ts` (`Cannot find module '@prisma/client'`
  when run exactly as documented). Fixed by moving `prisma/` and `scripts/`
  into `backend/`, matching Prisma's own conventional layout. No `--schema`
  flag or `package.json#prisma` field needed anymore (that field was also
  deprecated in Prisma 6, removed in 7).
- `routes/messages.routes.ts`: `type: { in: ["COMMITTEE", "DM"] as const[] }`
  was a syntax error (`const[]` isn't a type) that failed `tsc` outright.
- `routes/webhook.routes.ts`: Stripe's `apiVersion` is a version-locked
  literal type tied to the installed SDK; the old `"2024-06-20"` string no
  longer type-checks against `stripe@22`.
- `src/screens/ProfileScreen.tsx`: imported `useSignOut` from
  `@clerk/clerk-expo`, which doesn't exist in the current API. Replaced with
  `useAuth()`, which exposes `signOut`.
- `src/screens/ChannelMessagesScreen.tsx`: referenced a `styles.bubbleOther`
  key that was never defined in the `StyleSheet`.
- `src/hooks/usePermissions.ts`: `ScopedEvent.committeeId` was typed as
  `string | null`, but `EventSummary.committeeId` (the type actually passed
  in from screens) is `string | null | undefined`, failing `tsc`.
- Root `tsconfig.json` `include` was `**/*.ts`, unintentionally pulling
  `prisma/seed.ts` and `scripts/promote-admin.ts` into the mobile app's
  typecheck, where `@prisma/client` isn't installed. Scoped `include` to
  `App.tsx` + `src/**/*`.

### Added — Missing repo essentials
- Root `.env.example` (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `EXPO_PUBLIC_API_URL`) — referenced by README/BUILD.md but never existed.
- Root `.gitignore` — referenced by `docs/PROJECT_STRUCTURE.md` but never
  existed (so `node_modules/`, `.env`, build output, etc. were all trackable).
- `package-lock.json` at both repo root and `backend/`.
- A validated initial migration (`backend/prisma/migrations/.../init/`),
  generated and applied against a real local PostgreSQL 16 instance as part
  of verification (see FINAL-VALIDATION.md) — a fresh clone can
  `prisma migrate deploy` immediately instead of needing an interactive
  `migrate dev` on first run.

### Fixed — Documentation
- `BUILD.md` described a `mobile/` subdirectory that never existed in this
  repo (the mobile app has always been the repo root); rewritten to match
  the actual layout and the new `backend/prisma/` location.
- `README.md` tech-stack table updated (was still advertising SDK 51 / RN
  0.74 / React Navigation v6 / Prisma 5).
- `docs/PROJECT_STRUCTURE.md` updated for the `backend/prisma/` and
  `backend/scripts/` moves and the `tsx` migration.

---

## [1.0.0] — 2026-07 — Internal Beta

### Added — Mobile App
- Google OAuth login via Clerk SSO (`AuthNavigator`)
- Session persistence via `expo-secure-store` token cache
- Home Dashboard with upcoming events, points summary, dues status, pinned announcement
- Events feed with category filter chips and per-user RSVP state
- Event detail with RSVP segmented control and attended/missed result card
- **Member check-in**: camera-based QR scanner (`CheckInScreen` member mode)
- **Officer check-in**: HMAC-signed rotating QR display (`CheckInScreen` officer mode) with 55-second refresh
- Event creation form (Officers: own committee; Exec: chapter-wide)
- Manual attendance override screen with mark/remove + reason modal (`AttendanceOverrideScreen`)
- Leaderboard with rank badges for top 3 and current-user highlight
- Messaging: channel list → `ChannelMessagesScreen` with optimistic send, pinning, thread stubs
- Dues status display on Profile and Dashboard
- Committee detail with member roster and channel navigation
- Admin panel (Officer+) with roster, dues overview, points, committee management
- Role-based tab visibility: AdminPanel tab hidden for MEMBER role

### Added — Backend
- `POST /auth/sync` — Clerk JWT verification + User upsert (no authMiddleware)
- `GET/POST /events` — PUBLISHED event list with per-user RSVP + attendance joins; create with `checkInTokenSecret`
- `GET /events/:id` — single event detail with `checkedInCount`
- `GET /events/:id/checkin-token` — HMAC-signed QR token (Officer/Exec scoped)
- `POST /events/:id/checkin` — QR token validation + Attendance + PointsLedger in single `$transaction`
- `POST /events/:id/rsvp` — upsert RSVP
- `GET/POST /events/:id/attendance/:userId` — manual override with audit log in `$transaction`
- `GET /users/me/dashboard` — 4-parallel-query aggregated home screen data
- `GET /users/me`, `GET /users`, `PATCH /users/:id/role` — member profile + roster + role promotion
- `GET /points/leaderboard` — all active members ranked
- `GET /points/ledger/:userId`, `POST /points/adjust` — per-user ledger with pagination
- `GET/POST /committees`, `PATCH /committees/:id` — committee CRUD
- `POST /committees/:id/members`, `DELETE /committees/:id/members/:userId` — membership management
- `GET /channels`, `GET/POST /channels/:id/messages` — messaging with canPost gating
- `PATCH /messages/:id/pin`, `DELETE /messages/:id` — pin + soft delete
- `GET/POST /dues`, `POST /dues/initialize`, `POST /dues/:id/payment`, `POST /dues/:id/waive`
- `POST /dues/reminders/send` — reminder dispatch stub
- `POST /webhooks/stripe` — idempotent payment webhook (lazy-initialized Stripe)
- Single `PrismaClient` singleton in `lib/prisma.ts`
- `writeAuditLog({ tx? })` accepts transaction client for atomic audit rows
- Lazy Stripe initialization — server starts without `STRIPE_SECRET_KEY`

### Security
- Dues router mounted **after** `authMiddleware` (SEC-01 fix)
- Stripe webhook uses HMAC signature verification, not JWT
- QR tokens use `crypto.timingSafeEqual` for HMAC comparison
- RBAC middleware: `requireRole`, `requireCommitteeScope`

### Fixed
- `isLoading: false` initial state prevents cold-start infinite spinner
- `lastName: z.string().min(0)` allows single-name Google accounts
- `colors.text` → `colors.textPrimary` throughout all screens
- Dashboard `myAttendance` select includes `late` field
- Attendance history filter uses correct relation name `ledgerEntries`
- `GET /committees/:id` response mapped to `{ members[], channelId }` shape
- `DuesRecord` dashboard query includes `semester` relation
- Conditional `Tab.Screen` replaced with `tabBarButton: () => null` pattern
- `EventDetail` type unified — removed local definition in `api/events.ts`
- Split `leaderboardLoading`/`ledgerLoading` in `usePointsStore`
- `useMessagesStore` optimistic sender uses real `useAuthStore.getState().user`
- Member "Check In" button added to `EventDetailScreen` (was officer-only)
- `backend/package.json` scripts point to correct file paths
- `GestureHandlerRootView` + `SafeAreaProvider` + `enableScreens()` in `App.tsx`
- `App.tsx` created with `ClerkProvider` wrapping the navigation tree

---

## [0.2.0] — 2026-06 — Audit + Hardening

- Phase 2: All Critical and High audit findings resolved
- Phase 3: Runtime validation; six E2E workflows traced to database

## [0.1.0] — 2026-05 — Initial Generation

- Full-stack project generated: schema, all routes, all screens, stores, navigation
