# ChapterHub — Project Structure

This document explains every directory and file in the repository.

> The app runs in Demo Mode by default (no backend/database/Clerk needed) —
> see [DEMO_MODE.md](DEMO_MODE.md) for how `src/mocks/` and `src/config/demo.ts`
> fit into everything described below.

---

## Repository Root

The repository root **is** the Expo mobile app. `npm install` and `npm start` run
from the root to build and launch the app. The backend lives in `backend/` as a
separate Node.js package with its own `package.json`.

```
chapterhub/
├── App.tsx               Root entry point. Wraps the app in providers:
│                           GestureHandlerRootView (gesture handler req.)
│                           ClerkProvider (auth)
│                           SafeAreaProvider (safe area insets)
│                           → RootNavigator
│
├── app.json              Expo configuration: bundle IDs, splash, plugins,
│                           camera permissions for iOS and Android.
│
├── babel.config.js       Babel preset: babel-preset-expo.
│
├── metro.config.js       Metro bundler config. Uses getDefaultConfig from Expo.
│
├── tsconfig.json         TypeScript config extending expo/tsconfig.base.
│                         Strict mode enabled. Path alias @/* → ./src/*.
│
├── package.json          Mobile app dependencies (react-native, expo, clerk,
│                           zustand, axios, navigation, etc.). Entry: App.tsx.
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
│   ├── seed.ts             In-memory mock "database" (users, events, dues, etc.)
│   ├── api.ts              Business logic, one function per real backend route
│   ├── router.ts           axios adapter — intercepts apiClient requests
│   ├── identity.ts         "Who am I logged in as" for the demo session
│   └── bootstrap.ts        Populates useAuthStore before first render
│
├── types/
│   └── index.ts          Single source of truth for all TypeScript types.
│                         Mirrors Prisma schema models exactly — no transform
│                         layer needed between API responses and UI state.
│                         Exports: User, EventSummary, EventDetail, Message,
│                           Channel, DuesRecord, LeaderboardEntry, etc.
│
├── theme/
│   └── colors.ts         18-key color palette. All colors referenced by name
│                         (colors.primary, colors.accent) — swap values here
│                         to rebrand. No raw hex strings in screen components.
│
├── utils/
│   └── achievements.ts   computeAchievements() — pure function deriving badge
│                         data from points/attendance/dues already fetched by
│                         ProfileScreen. Not a backend concept; works identically
│                         in Demo Mode and against the real API.
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
│   │                       · Bearer token injection (set by AuthNavigator)
│   │                       · ApiError normalization for all responses
│   │                     Exports: apiClient, setAuthToken, getAuthToken, ApiError
│   │
│   ├── auth.ts           POST /auth/sync — called right after Clerk sign-in
│   │                     to upsert the DB User row.
│   │
│   ├── events.ts         GET /events, GET /events/:id, POST /events/:id/rsvp
│   │
│   ├── users.ts          GET /users/me, GET /users/me/dashboard, GET /users,
│   │                     GET /points/leaderboard, GET /points/ledger/:id,
│   │                     POST /points/adjust, PATCH /users/:id/role
│   │
│   ├── attendance.ts     GET /events/:id/attendance (roster),
│   │                     POST /events/:id/attendance/:userId (override),
│   │                     GET /attendance/history, GET /events/:id/checkin-token,
│   │                     POST /events/:id/checkin
│   │
│   ├── committees.ts     GET/POST /committees, PATCH /committees/:id,
│   │                     POST/DELETE /committees/:id/members
│   │
│   ├── messages.ts       GET /channels, GET/POST /channels/:id/messages,
│   │                     PATCH /messages/:id/pin, DELETE /messages/:id
│   │
│   └── dues.ts           GET /dues/me, GET /dues, POST /dues/initialize,
│                         POST /dues/:id/payment, POST /dues/:id/waive,
│                         POST /dues/reminders/send
│
├── hooks/
│   └── usePermissions.ts Thin client-side mirror of server RBAC. Returns
│                         boolean flags: isOfficerOrAbove, isExecOrAbove,
│                         canManageEvent(event), canViewAdminPanel.
│                         Used to show/hide UI elements. Server re-checks
│                         every permission independently.
│
├── navigation/
│   ├── types.ts          TypeScript param lists for all navigators:
│   │                       AuthStackParamList, MainTabParamList,
│   │                       AppStackParamList, RootStackParamList
│   │
│   ├── RootNavigator.tsx Auth gate. Reads useAuthStore: if user is set →
│   │                     AppNavigator; if not → AuthNavigator; if isLoading
│   │                     → spinner. Wraps NavigationContainer.
│   │
│   ├── AuthNavigator.tsx Single-screen Login flow:
│   │                       startSSOFlow → setActive → getToken →
│   │                       setAuthToken → syncUser → setUser
│   │
│   └── AppNavigator.tsx  Bottom tab navigator (5 tabs + hidden Admin) nested
│                         inside an app stack for shared screens
│                         (EventDetail, CheckIn, ChannelMessages, etc.).
│                         AdminPanel tab uses tabBarButton:()=>null for Members.
│
├── screens/              One file per screen component.
│   ├── HomeDashboardScreen.tsx   Dashboard: points, dues, upcoming events,
│   │                              pinned announcement. Single API call.
│   │
│   ├── EventsFeedScreen.tsx      Event list with category + required filters.
│   │                              useFocusEffect fetches on every tab visit.
│   │
│   ├── EventDetailScreen.tsx     Full event detail, RSVP control, member
│   │                              "Check In" button, officer management section.
│   │
│   ├── CreateEventScreen.tsx     Event creation form. Officers: committeeId
│   │                              required. Exec: may omit for chapter-wide.
│   │
│   ├── CheckInScreen.tsx         Dual mode:
│   │                              officer → QR code display with 55s refresh
│   │                              member  → expo-camera QR scanner
│   │
│   ├── LeaderboardScreen.tsx     Ranked member list. Top 3 badges. Own entry
│   │                              highlighted. Fetches on focus.
│   │
│   ├── MessagingScreen.tsx       Channel list. Sorted by type then name.
│   │                              Last-message preview. canPost badge.
│   │
│   ├── ChannelMessagesScreen.tsx Inverted FlatList. Optimistic send. Pin
│   │                              long-press. Pull-up to load older messages.
│   │
│   ├── ProfileScreen.tsx         Own profile: role, dues status, attendance
│   │                              history, achievements, sign-out. In Demo
│   │                              Mode: role-switcher banner (mocks/bootstrap.ts).
│   │
│   ├── CommitteeDetailScreen.tsx Committee info, member roster (with add/remove
│   │                              for Chair), channel link, upcoming events.
│   │
│   ├── MemberProfileScreen.tsx   Another member's read-only profile. Exec+ sees
│   │                              an "Adjust Points" shortcut into PointsAdjust.
│   │
│   ├── MapViewScreen.tsx         Event location + "Open in Maps" link. No map
│   │                              SDK is installed — this isn't an embedded map.
│   │
│   ├── NotImplementedScreen.tsx  Honest placeholder for AuditLog and Thread —
│   │                              neither has a backend route in the real app.
│   │
│   └── admin/
│       ├── AdminPanelScreen.tsx          Tabs: Roster · Points · Dues · Committees.
│       │                                  Role management, dues overview, points
│       │                                  adjust navigation.
│       ├── AttendanceOverrideScreen.tsx  Event roster with per-member check-in
│       │                                  status. Mark present / remove with
│       │                                  required reason modal.
│       ├── RosterDetailScreen.tsx        Searchable/filterable full member
│       │                                  directory. Row tap → MemberProfile.
│       ├── PointsAdjustScreen.tsx        Bonus/penalty/correction form for one
│       │                                  member. Reached from MemberProfile.
│       └── DuesDetailScreen.tsx          Chapter-wide dues table with Record
│                                          Payment / Waive actions (Exec+).
│
└── store/                Zustand stores. One per domain.
    ├── useAuthStore.ts   user: AppUser | null, isLoading: boolean, setUser().
    │                     isLoading starts false — cold start routes to Login.
    │
    ├── useEventsStore.ts events: EventSummary[], fetchEvents(), updateRsvpLocally().
    │                     updateRsvpLocally enables optimistic RSVP in EventDetail.
    │
    ├── usePointsStore.ts Separated leaderboardLoading / ledgerLoading flags
    │                     to prevent concurrent-fetch race conditions.
    │
    └── useMessagesStore.ts channels[], channelData{}, fetchChannels(),
                            fetchMessages(), loadMoreMessages(), sendMessage(),
                            togglePin(). sendMessage() uses real user from
                            useAuthStore for optimistic bubble alignment.
```

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
├── package.json      Express, Prisma, Clerk, Stripe, Zod, tsx.
│                     Scripts:
│                       dev → tsx watch server.ts
│                       db:seed → tsx prisma/seed.ts
│                       db:* → prisma ... (schema auto-discovered at prisma/schema.prisma)
│
├── tsconfig.json     Target: ES2022, module: CommonJS, rootDir: ./
│
├── .env.example      DATABASE_URL, CLERK_SECRET_KEY, STRIPE_* (optional),
│                     PORT, CORS_ORIGIN, NODE_ENV
│
├── server.ts         Express app. Mount order matters:
│                       express.raw (Stripe path only, before express.json)
│                       express.json + CORS
│                       /health endpoint
│                       webhookRouter (pre-auth, Stripe HMAC)
│                       authRouter (pre-auth, Clerk inline verify)
│                       authMiddleware (JWT → req.user for all below)
│                       usersRouter, eventsRouter, attendanceRouter,
│                       committeesRouter, duesRouter, messagesRouter
│
├── lib/
│   ├── prisma.ts     PrismaClient singleton. One connection pool for the
│   │                 entire process — import from here everywhere.
│   │
│   └── dues.helpers.ts  recalcDuesStatus(duesRecordId) — recomputes
│                         DuesRecord.status and amountPaid from Payment rows.
│                         Shared by dues.routes.ts and webhook.routes.ts.
│
├── middleware/
│   ├── auth.ts       Verifies Clerk JWT (standalone `verifyToken()` from
│   │                 @clerk/backend) → looks up User by authProviderId →
│   │                 populates req.user. Returns 401 if missing, 401 if
│   │                 invalid, 401 with code NEEDS_SYNC if user not in DB.
│   │
│   └── rbac.ts       requireRole(minRole) — role-rank check.
│                     requireCommitteeScope(getCommitteeId) — CHAIR check
│                       for officers + global bypass for Exec+.
│                     writeAuditLog({ actorId, action, ..., tx? }) — creates
│                       AuditLog row; pass tx to make it atomic with mutation.
│
├── routes/
│   ├── auth.routes.ts        POST /auth/sync — upserts User from Clerk JWT
│   ├── events.routes.ts      Events CRUD + RSVP + QR token + check-in
│   ├── users.routes.ts       User profile + dashboard + roster + role
│   ├── attendance.routes.ts  Attendance history + manual override + leaderboard
│   ├── committees.routes.ts  Committee CRUD + membership management
│   ├── dues.routes.ts        Dues records + payments + waivers + reminders
│   ├── messages.routes.ts    Channels + messages + pin + soft delete
│   └── webhook.routes.ts     POST /webhooks/stripe — Stripe HMAC auth,
│                             lazy Stripe initialization, idempotent payments
│
├── prisma/           ← database schema, seed, migrations (colocated with the
│   │                    package that depends on @prisma/client — this matters,
│   │                    see "Key Architectural Constraints" below)
│   ├── schema.prisma  Prisma schema for PostgreSQL 16.
│   │                  Models: User, Semester, Committee, CommitteeMembership,
│   │                    Event, Rsvp, Attendance, PointsLedger, DuesRecord,
│   │                    Payment, Channel, ChannelMembership, Message, AuditLog.
│   │                  All enums match TypeScript types in src/types/index.ts.
│   ├── seed.ts        Idempotent seed script. Creates: current Semester row,
│   │                    GENERAL channel, OFFICERS channel.
│   │                  Command: npm --prefix backend run db:seed
│   └── migrations/    Committed to version control (standard Prisma practice).
│                      A validated `init` migration ships out of the box.
│
└── scripts/
    └── promote-admin.ts    One-time script to promote a user to SUPER_ADMIN by
                            email address. Run with (from backend/):
                              npx tsx scripts/promote-admin.ts admin@example.com
```

---

## `docs/` — Documentation

```
docs/
└── PROJECT_STRUCTURE.md    This file.
```

Additional documentation lives at the repo root: `README.md`, `BUILD.md`,
`TESTING.md`, `CHANGELOG.md`, `FINAL-VALIDATION.md`.

---

## Key Architectural Constraints

**Import paths are all relative within `src/`.** There is no `babel-plugin-module-resolver`
or `tsconfig-paths` at runtime, so `@/` path aliases cannot be used in code (the tsconfig
alias is declared for IDE tooling only). Use `"../theme/colors"` not `"@/theme/colors"`.

**`prisma/` and `scripts/` live inside `backend/`, not at the repo root.** They were
originally siblings of `backend/` at the repo root. That layout is broken: Prisma's
own dependency-resolution logic (and plain Node `require()` resolution for bare
specifiers) walks up from a file's own directory, not from the process's CWD. A
schema or script sitting outside `backend/`'s directory tree can never see
`backend/node_modules/@prisma/client` — Prisma "fixes" this by auto-installing
`@prisma/client`/`prisma` into whatever `package.json` it finds walking up from the
schema's location instead, which silently corrupted the **mobile app's**
`package.json` on every `db:generate`. Keeping both directories inside `backend/`
(Prisma's own recommended convention) removes the whole failure class and is why
no `--schema` flag is needed anywhere anymore.

**One `PrismaClient`.** Always import from `backend/lib/prisma.ts`. Never call `new PrismaClient()` elsewhere.

**Stripe is lazy-initialized.** `webhook.routes.ts` calls `getStripe()` at request time, not
at module load. The server starts without `STRIPE_SECRET_KEY`.

**`authMiddleware` is mounted before all application routes** except `webhookRouter` (Stripe HMAC)
and `authRouter` (Clerk inline verify). The dues router is correctly after auth.
