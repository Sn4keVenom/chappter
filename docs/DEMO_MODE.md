# Demo Mode

ChapterHub launches into a fully mocked, fully interactive demo **by
default** — no Clerk account, no PostgreSQL, no Express backend, no `.env`
file. This is for evaluating the UI, navigation, and feature set quickly.

```bash
git clone <repo>
cd chapterhub
npm install
npm start
```

Scan the QR with Expo Go (or press `i`/`a` for the iOS Simulator / Android
Emulator) and you're in — no login screen, no setup.

## What's mocked

Everything the backend would normally provide, generated once per app
launch and held in memory for the session:

- **14 mock members** spanning every role (Member, Officer, Exec, Super
  Admin) and status (Active, Pledge, Suspended, Alumni)
- **4 committees** with chairs and members
- **12 events** — a mix of past (with real attendance/points already
  recorded) and upcoming (with RSVPs), across every category
- **A full points ledger** — attendance points plus a few hand-authored
  bonus/penalty/correction entries
- **Dues records** for the current semester in every status (Paid, Partial,
  Unpaid, Waived) with payment history
- **7 channels** (general, officers, one per committee, one DM) with
  realistic message threads and a pinned announcement
- **Achievement badges**, computed client-side from the above (see
  `src/utils/achievements.ts`) — not a backend concept, just a nice touch
  for evaluating polish

Dates are computed relative to when you actually launch the app, so
"upcoming" events are always in the future no matter when you run this.

## What's real

Every screen, every store, every function in `src/api/*.ts` is **completely
unchanged** between Demo Mode and a real backend connection. RSVPs, QR
check-ins, sending messages, pinning, recording dues payments, adjusting
points, creating events, editing committees — all of it mutates the
in-memory mock data exactly like it would mutate a real database, and the
UI reacts exactly the same way (optimistic updates, pull-to-refresh, error
states). Reload the app and the demo resets to its seed data.

## Switching who you're logged in as

Demo Mode defaults to a Super Admin so every tab and admin action is
visible. Open the **Profile** tab and tap the "Demo Mode — viewing as ___"
banner (or "Reset demo session" at the bottom) to switch between four
representative users — one per role — so you can see exactly what a
regular Member sees versus an Officer scoped to one committee versus an
Exec with chapter-wide dues access.

## How it works

A custom axios `adapter` (`src/mocks/router.ts`) intercepts every request
made by the shared `apiClient` instance (`src/api/client.ts`) and answers
it from local mock data (`src/mocks/seed.ts`, `src/mocks/api.ts`) instead
of the network — same request/response shapes the real Express routes use.
Nothing else in the app — no screen, no store, no `api/*.ts` function —
knows this exists.

```
src/config/demo.ts     DEMO_MODE flag (env-var driven, on by default)
src/mocks/seed.ts       In-memory mock "database"
src/mocks/api.ts        Business logic, one function per real backend route
src/mocks/router.ts     axios adapter — dispatches HTTP-shaped calls into api.ts
src/mocks/identity.ts   "Who am I logged in as" for the demo session
src/mocks/bootstrap.ts  Populates useAuthStore before first render; role switcher
```

## Reconnecting the real backend

Demo Mode is a config flag, not a fork — turning it off requires no code
changes:

1. Set up Clerk, PostgreSQL, and the backend per [BUILD.md](../BUILD.md).
2. In your root `.env` (copy from `.env.example`):
   ```
   EXPO_PUBLIC_DEMO_MODE="false"
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
   EXPO_PUBLIC_API_URL="http://192.168.1.x:4000/api/v1"
   ```
3. `npm start` — the app now uses `ClerkProvider` for real auth and the
   axios instance talks to your backend over the network instead of the
   mock adapter.

## Known limitations

- Demo state is in-memory only — it resets on every app reload/JS bundle
  refresh. There's no persistence layer in Demo Mode (matching the real
  app's design, which also has no offline cache).
- QR check-in is intentionally lenient in Demo Mode: any non-empty scanned
  code checks you into the event you opened the scanner from, since testing
  a real two-device QR handoff isn't practical when evaluating the app
  solo. The officer-side rotating token generation is otherwise real.
- `AuditLog` and `Thread` screens show an honest "not implemented" message
  rather than fake data — neither has a backend route in the real app
  either (no `audit-log` endpoint exists, and nothing links to `Thread` in
  the current UI). `MapView` shows the event's location text and an "Open
  in Maps" link rather than an embedded map — no map SDK is installed.
