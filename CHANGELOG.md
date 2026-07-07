# Changelog

All notable changes to ChapterHub are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

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
