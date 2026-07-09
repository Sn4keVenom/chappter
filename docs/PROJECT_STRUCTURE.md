# ChapterHub — Project Structure

This document explains every directory and file in the repository.

> The app runs in Demo Mode by default (no backend/database/Clerk needed) —
> see [DEMO_MODE.md](DEMO_MODE.md) for how `src/mocks/` and `src/config/demo.ts`
> fit into everything described below. See [PERMISSIONS.md](PERMISSIONS.md)
> for the roles/offices/permissions/modules system referenced throughout
> this file.

---

## Repository Root

The repository root **is** the Expo mobile app. `npm install` and `npm start` run
from the root to build and launch the app. The backend lives in `backend/` as a
separate Node.js package with its own `package.json`.

```
chapterhub/
├── App.tsx               Root entry point. Wraps the app in providers:
│                           ErrorBoundary (top-level render-error safety net)
│                           GestureHandlerRootView (gesture handler req.)
│                           ClerkProvider (auth, real mode only)
│                           SessionRestore (real mode only — restores an
│                             existing Clerk session on cold start)
│                           SafeAreaProvider (safe area insets)
│                           → RootNavigator
│
├── app.json              Expo configuration: bundle IDs, splash, plugins,
│                           camera/calendar permissions for iOS and Android.
│
├── babel.config.js       Babel preset: babel-preset-expo.
│
├── metro.config.js       Metro bundler config. Uses getDefaultConfig from Expo.
│
├── tsconfig.json         TypeScript config extending expo/tsconfig.base.
│                         Strict mode enabled. Path alias @/* → ./src/*
│                         (IDE tooling only — see Key Architectural
│                         Constraints below).
│
├── package.json          Mobile app dependencies (react-native, expo, clerk,
│                           zustand, axios, navigation, expo-calendar, etc.).
│
├── eas.json              Expo Application Services build profiles
│                           (development, preview, production).
│
├── .env.example          Template for required environment variables.
│                           Copy to .env and fill in values.
│
└── .gitignore            Excludes node_modules, .env, .expo, dist, etc.
```

---

## `src/` — Mobile Application Source

All TypeScript/React Native source for the mobile app. Every subdirectory
corresponds to a distinct architectural layer.

```
src/
├── config/
│   └── demo.ts           DEMO_MODE flag (on by default, no env var required).
│                         See docs/DEMO_MODE.md.
│
├── mocks/                Demo Mode's mock backend. See docs/DEMO_MODE.md for
│   │                     the full picture — briefly:
│   ├── seed.ts             In-memory mock "database" — users, events, dues,
│   │                       teams, committee budgets, documents, feedback
│   │                       reports, module configs, role permission presets.
│   ├── api.ts              Business logic, one function per real backend
│   │                       route — imports the SAME permission engine
│   │                       (permissions/permissions.ts) the client hook uses.
│   ├── router.ts           axios adapter — intercepts apiClient requests
│   ├── identity.ts         "Who am I logged in as" for the demo session
│   └── bootstrap.ts        Populates useAuthStore + permission/module
│                           stores before first render
│
├── types/
│   └── index.ts          Single source of truth for all TypeScript types.
│                         Mirrors Prisma schema models exactly — no transform
│                         layer needed between API responses and UI state.
│                         Includes: UserRole, MemberStatus, ExecOffice,
│                         Permission/ALL_PERMISSIONS, ModuleKey/ModuleConfig,
│                         ChapterSettings, ChapterDocument, FeedbackReport,
│                         User, EventSummary, Message, DuesRecord, etc.
│
├── permissions/
│   └── permissions.ts    The permission engine — DEFAULT_ROLE_PRESETS,
│                         hasPermission(), hasScopedManagementAccess() /
│                         hasAnyManagementAccess() (committee-chair scoping,
│                         independent of role). Imported by BOTH
│                         hooks/usePermissions.ts (client) and
│                         mocks/api.ts (mock server) so they can never
│                         drift apart. See docs/PERMISSIONS.md.
│
├── theme/
│   └── colors.ts         Color palette. All colors referenced by name
│                         (colors.primary, colors.accent) — swap values here
│                         to rebrand. No raw hex strings in screen components
│                         (with a handful of legitimate white-on-color-button
│                         exceptions — see the production audit report).
│
├── components/           Small shared, cross-screen components.
│   ├── ErrorBoundary.tsx  Top-level React error boundary (class component —
│   │                       no hook equivalent exists). Single integration
│   │                       point for a future crash-reporting SDK.
│   └── RequireAccess.tsx  Self-gating "Access Restricted" screen used by
│                           admin/privileged screens reached via
│                           navigation.navigate() on the shared stack, where
│                           hiding the button that navigates there isn't
│                           enough (deep links, programmatic navigation).
│
├── utils/
│   ├── achievements.ts   computeAchievements() — pure function deriving badge
│   │                     data from points/attendance/dues already fetched by
│   │                     ProfileScreen. Not a backend concept; works identically
│   │                     in Demo Mode and against the real API.
│   └── calendar.ts       Calendar export (spec §7) — Google/Outlook web
│                         links (Linking, no permission needed), a real
│                         on-device Apple/Android calendar write via
│                         expo-calendar, and universal ICS export via Share.
│
├── api/                  One file per backend resource. Each file exports
│   │                     async functions that call apiClient and return typed
│   │                     data. No business logic here — just HTTP wrappers.
│   │                     Unchanged between Demo Mode and the real backend —
│   │                     see client.ts below.
│   │
│   ├── client.ts         Axios instance with:
│   │                       · Base URL from EXPO_PUBLIC_API_URL env var
│   │                       · Demo Mode: installs mocks/router.ts as a custom
│   │                         axios adapter instead of hitting the network
│   │                       · Bearer token injection (set by AuthNavigator/
│   │                         SessionRestore)
│   │                       · Automatic retry-once for idempotent GET
│   │                         requests on network error/5xx
│   │                       · ApiError normalization for all responses
│   │                     Exports: apiClient, setAuthToken, getAuthToken, ApiError
│   │
│   ├── auth.ts           POST /auth/sync — called right after Clerk sign-in
│   │                     to upsert the DB User row.
│   ├── events.ts         Events CRUD, RSVP, check-in token/scan, delegates
│   ├── users.ts          Profile, dashboard, roster, role/office/status,
│   │                     leaderboard, points ledger/adjust
│   ├── attendance.ts     Attendance roster/history, manual override,
│   │                     check-in token/self-check-in
│   ├── committees.ts     Committee CRUD + membership management
│   ├── messages.ts       Channels, messages, pin, soft delete
│   ├── dues.ts           Dues records, Pyli self-service payment, manual
│   │                     payment, waive, reminders
│   ├── teams.ts          Gamification teams + team leaderboard
│   ├── finance.ts        Committee budgets + expense reimbursements
│   ├── settings.ts       Chapter Settings (spec §6)
│   ├── modules.ts        Module/feature toggles (spec §5)
│   ├── permissions.ts    Role→permission preset editor (spec §3)
│   ├── documents.ts      Documents + external links (spec §8)
│   └── feedback.ts       Feedback & bug reports (spec §9)
│
├── hooks/
│   ├── usePermissions.ts Client-side mirror of the permission engine.
│   │                     Returns granular can(permission) plus named
│   │                     booleans (isExecOrAbove, isSuperAdmin,
│   │                     canManageEvent(event), canViewAdminPanel, etc.)
│   │                     for screens written before the granular system
│   │                     existed. Server (mock or real) re-checks every
│   │                     permission independently — this only hides UI.
│   └── useAppAuth.ts     Wraps Clerk's useAuth()/signOut so screens don't
│                         crash when ClerkProvider isn't mounted (Demo Mode).
│
├── navigation/
│   ├── types.ts          TypeScript param lists for all navigators.
│   ├── RootNavigator.tsx Auth gate. Reads useAuthStore: if user is set →
│   │                     AppNavigator; if not → AuthNavigator.
│   ├── SessionRestore.tsx  Real-mode-only: restores an existing Clerk
│   │                     session on cold start so users aren't forced to
│   │                     re-login every time they force-quit the app.
│   ├── AuthNavigator.tsx Single-screen Login flow (Google OAuth via Clerk).
│   └── AppNavigator.tsx  Bottom tab navigator nested inside an app stack
│                         for shared screens. Tabs whose module is disabled
│                         (Messaging, Leaderboard) hide their button via
│                         tabBarButton:()=>null, same pattern as the Admin
│                         tab's role-based visibility.
│
├── store/                Zustand stores. One per domain.
│   ├── useAuthStore.ts       user: AppUser | null, isLoading, setUser().
│   ├── useEventsStore.ts     events, loading, error, fetchEvents().
│   ├── usePointsStore.ts     Separated leaderboard/ledger loading flags.
│   ├── useMessagesStore.ts   channels[], channelData{}, send/pin/fetch.
│   ├── useModulesStore.ts    Current module enable/disable state — every
│   │                         screen belonging to a toggleable module reads
│   │                         isEnabled(key) from here.
│   └── usePermissionsStore.ts  Current role→permission map — mutable,
│                               edited from admin/PermissionsScreen.tsx.
│
└── screens/              One file per screen component.
    ├── HomeDashboardScreen.tsx, EventsFeedScreen.tsx, EventDetailScreen.tsx,
    │   CreateEventScreen.tsx, CheckInScreen.tsx, MapViewScreen.tsx
    ├── LeaderboardScreen.tsx, TeamDetailScreen.tsx
    ├── MessagingScreen.tsx, ChannelMessagesScreen.tsx
    ├── ProfileScreen.tsx, MemberProfileScreen.tsx
    ├── CommitteeDetailScreen.tsx, SubmitExpenseScreen.tsx
    ├── DocumentsScreen.tsx, DocumentCategoryScreen.tsx  (spec §8)
    ├── FeedbackScreen.tsx  (submit — spec §9)
    ├── NotImplementedScreen.tsx  Honest placeholder for AuditLog/Thread —
    │   neither has a backend read endpoint yet.
    └── admin/
        ├── AdminPanelScreen.tsx        Dashboard: stat cards + action rows,
        │                                each gated by permission/module state.
        ├── AttendanceOverrideScreen.tsx  Manual attendance management.
        ├── RosterDetailScreen.tsx      Searchable member directory.
        ├── PointsAdjustScreen.tsx      Bonus/penalty/correction form.
        ├── DuesDetailScreen.tsx        Chapter-wide dues table.
        ├── CommitteeBudgetsScreen.tsx  Treasurer budget allocation.
        ├── ExpensesScreen.tsx          Reimbursement review queue.
        ├── ChapterSettingsScreen.tsx   Super Admin only (spec §6).
        ├── ModulesScreen.tsx           Super Admin only (spec §5).
        ├── PermissionsScreen.tsx       Super Admin only (spec §3).
        └── FeedbackListScreen.tsx      Exec+ review queue (spec §9).
```

All seven of the Super-Admin/Exec-only admin screens self-gate with
`components/RequireAccess.tsx` — reachable directly via
`navigation.navigate(...)`, so hiding the button that leads to them on
`AdminPanelScreen` is not sufficient on its own.

---

## `assets/` — Static Assets

```
assets/
├── icon.png          1024×1024 — App Store / Play Store app icon (navy)
├── splash.png        1284×2778 — iOS splash screen (navy)
├── adaptive-icon.png 1024×1024 — Android adaptive icon foreground (gold)
└── favicon.png       48×48    — Web favicon (navy)
```

Replace these with final branded assets before App Store submission.

---

## `backend/` — API Server

Separate Node.js package. Run all commands from inside `backend/`.

```
backend/
├── package.json      Express, Prisma, Clerk, Stripe, Zod, tsx, plus
│                     production hardening: helmet, morgan, express-rate-limit.
│
├── tsconfig.json     Target: ES2022, module: CommonJS, rootDir: ./
│
├── .env.example      DATABASE_URL, CLERK_SECRET_KEY, STRIPE_* (optional),
│                     PORT, CORS_ORIGIN, NODE_ENV
│
├── server.ts         Express app. Mount order matters (see file's own
│                     header comment for the full numbered breakdown):
│                       lib/env (fail-fast env validation) → helmet →
│                       morgan (request logging) → express.json + CORS →
│                       rate limiting → /health (checks DB connectivity) →
│                       webhookRouter (pre-auth) → authRouter (pre-auth) →
│                       authMiddleware → every application router →
│                       404 handler → global error handler.
│                     Also registers SIGTERM/SIGINT graceful shutdown.
│
├── lib/
│   ├── prisma.ts        PrismaClient singleton.
│   ├── env.ts           Fails fast at boot if DATABASE_URL/CLERK_SECRET_KEY
│   │                     are missing, instead of a cryptic runtime error.
│   ├── asyncHandler.ts  Wraps every async route handler — Express 4 doesn't
│   │                     forward a rejected Promise to error middleware on
│   │                     its own; without this, one unexpected error could
│   │                     hang a request or crash the whole process.
│   └── dues.helpers.ts  recalcDuesStatus(duesRecordId).
│
├── middleware/
│   ├── auth.ts       Verifies Clerk JWT → populates req.user.
│   └── rbac.ts       requireRole(minRole), isAtLeast(role, min) — single
│                     source of truth for role-tier comparisons (every
│                     route imports this instead of keeping a local copy).
│                     requireCommitteeScope(getCommitteeId) — chair-scoped
│                     access. writeAuditLog(...).
│
├── routes/
│   ├── auth.routes.ts          POST /auth/sync
│   ├── events.routes.ts        Events CRUD + RSVP + QR token + check-in
│   ├── users.routes.ts         Profile + dashboard + roster + role/office/status
│   ├── attendance.routes.ts    Attendance history + manual override + leaderboard
│   ├── committees.routes.ts    Committee CRUD + membership management
│   ├── dues.routes.ts          Dues records + payments + waivers + reminders
│   ├── messages.routes.ts      Channels + messages + pin + soft delete
│   ├── settings.routes.ts      Chapter Settings (spec §6)
│   ├── modules.routes.ts       Module toggles (spec §5)
│   ├── documents.routes.ts     Documents + external links (spec §8)
│   ├── feedback.routes.ts      Feedback & bug reports (spec §9)
│   ├── permissions.routes.ts   Role→permission preset CRUD (spec §3) —
│   │                           persists edits, but see the "IMPORTANT" doc
│   │                           comment at the top of this file: no other
│   │                           route reads this table for authorization
│   │                           yet. See docs/PERMISSIONS.md.
│   └── webhook.routes.ts       POST /webhooks/stripe
│
├── prisma/
│   ├── schema.prisma  Prisma schema for PostgreSQL 16. All enums match
│   │                  TypeScript types in src/types/index.ts. See the
│   │                  ChapterSettings model's doc comment for the
│   │                  single-chapter-per-deployment assumption baked into
│   │                  this whole schema (no multi-tenancy).
│   ├── seed.ts        Idempotent seed script.
│   └── migrations/    Committed to version control. NOTE: needs a fresh
│                      `prisma migrate dev` against a real Postgres instance
│                      before deploying — the schema has changed
│                      substantially since the committed `init` migration.
│
└── scripts/
    └── promote-admin.ts    One-time script to promote a user to SUPER_ADMIN.
```

---

## `docs/` — Documentation

```
docs/
├── PROJECT_STRUCTURE.md    This file.
├── DEMO_MODE.md            How Demo Mode works, what's mocked.
└── PERMISSIONS.md          Roles/offices/permissions/modules reference,
                             including the mock-vs-real-backend parity gap.
```

Additional documentation lives at the repo root: `README.md`, `BUILD.md`,
`TESTING.md`, `CHANGELOG.md`, `FINAL-VALIDATION.md`.

---

## Key Architectural Constraints

**Import paths are all relative within `src/`.** There is no `babel-plugin-module-resolver`
or `tsconfig-paths` at runtime, so `@/` path aliases cannot be used in code (the tsconfig
alias is declared for IDE tooling only). Use `"../theme/colors"` not `"@/theme/colors"`.

**`prisma/` and `scripts/` live inside `backend/`, not at the repo root** — Prisma's
own dependency-resolution logic walks up from the schema file's own directory, not the
process's CWD, so keeping both inside `backend/` avoids a whole class of failure
(see git history for the incident this fixed).

**One `PrismaClient`.** Always import from `backend/lib/prisma.ts`.

**Stripe is lazy-initialized.** The server starts without `STRIPE_SECRET_KEY`.

**Every async route handler is wrapped in `asyncHandler`.** Express 4 does not
forward async errors to the error-handling middleware on its own — see
`backend/lib/asyncHandler.ts`'s doc comment. Any new route added to any
`routes/*.ts` file must follow the same pattern.

**Permission enforcement has two different levels of completeness.** The
Demo Mode mock (`src/mocks/api.ts`) fully implements the granular
permission system. The real backend persists role→permission edits but
still authorizes every *other* route with a flat role-tier check
(`requireRole`/`isAtLeast`) — see `docs/PERMISSIONS.md` "Backend parity
gap" before assuming a permission edit changes real backend behavior.

**This schema is single-chapter-per-deployment, not multi-tenant.** There is
no `Chapter` model; every table implicitly belongs to whichever chapter
this database serves. See `schema.prisma` `ChapterSettings` doc comment.
