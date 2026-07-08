# ChapterHub — Final Validation Report

**Validated:** 2026-07-07
**Validated by:** Full local audit + real installs, typechecks, Metro bundles, and a
real PostgreSQL 16 instance (not guessed — every claim below was executed and its
output inspected).

---

## Chosen stack

| Component | Version | Why |
|---|---|---|
| **Expo SDK** | **57** (`57.0.4`) | Expo Go on the app stores only runs the current SDK. An older "safer-looking" SDK (54/56) would simply fail to open in Expo Go today, which fails the Phase 6 "open Expo Go" requirement outright. 57 is ~1 week old but every dependency below was confirmed compatible against it. |
| **React** | `19.2.3` (exact) | Version bundled by Expo SDK 57 (`expo/bundledNativeModules.json`). Pinned exactly, not with a range, because `react-dom`'s peer requirement (`^19.2.3`) combined with a range on `react` let npm float to `19.2.7`, which `expo-doctor` flagged as a patch mismatch against the SDK's tested pairing. |
| **React Native** | `0.86.0` | Bundled by Expo SDK 57. |
| **React Navigation** | v7 (`@react-navigation/native@7.3.8`, `bottom-tabs@7.18.8`, `native-stack@7.17.10`) | v6 doesn't declare React 19 support; v7 does (`peer react: ">= 18.2.0"`, tested against 19.x). Confirmed via `npm view <pkg> peerDependencies`. |
| **Clerk (mobile)** | `@clerk/clerk-expo@2.19.41` | npm's `latest` dist-tag (`2.19.31`) falls inside a **high-severity** authorization-bypass advisory, [GHSA-w24r-5266-9c3c](https://github.com/advisories/GHSA-w24r-5266-9c3c) (CVSS 8.1, range `>=2.2.11 <=2.19.35`). `2.19.41` is outside the affected range and was published after it. Confirmed via `npm audit`. |
| **Clerk (backend)** | `@clerk/backend@3.11.1` | Current major; API usage was actually broken in the existing code (see Critical Findings). |
| **Prisma** | `6.19.3` (client + CLI) | Prisma 7 requires driver adapters and a `prisma.config.ts` migration (the `datasource { url = env(...) }` pattern the schema uses is rejected outright — confirmed by actually running `prisma generate` against the real schema under both majors). That's a breaking schema/config rewrite out of scope for a dependency repair. 6.19.3 works against the existing `schema.prisma` with zero changes. |
| **TypeScript (mobile)** | `~6.0.3` | Exact version Expo SDK 57 declares as required (`expo-doctor` fails otherwise). |
| **TypeScript (backend)** | `^5.9.3` | Backend has no Expo constraint; stayed on the mature 5.x line. Independent package, no cross-version conflict. |
| **Express** | `^4.22.2` | Stayed on 4.x. Express 5 is available and the existing routes have no wildcard-route or `req.query`-mutation patterns that would obviously break, but auditing every route for the full 4→5 behavioral migration was out of scope for a dependency repair — 4.22.2 is current, maintained, and a zero-risk match for the existing code. |
| **Zod** | `^3.25.76` | Stayed on 3.x. v4 renames APIs the route validators use (e.g. `z.string().datetime()`); the existing validators are extensive enough that a v4 rewrite would be a feature-scope change, not a dependency repair. |
| **Stripe** | `^22.3.0` | Current. Its `apiVersion` option is a version-locked literal type; the code's old `"2024-06-20"` literal no longer type-checks and was updated to `"2026-06-24.dahlia"` (the version this SDK build expects). |
| **Zustand** | `^5.0.14` (mobile) | v5, confirmed the existing `create<T>((set) => ...)` direct-call usage still type-checks under v5's stricter generics. |
| **tsx** | `^4.23.0` (backend) | Replaces `ts-node-dev` (unmaintained since 2022) and `ts-node` for the dev server, seed script, and admin script. |

---

## Critical findings fixed (real bugs, not just version bumps)

1. **Authentication was completely broken.** `backend/middleware/auth.ts` and
   `backend/routes/auth.routes.ts` called `clerk.verifyToken(token)` on a
   `createClerkClient()` instance. That method does not exist on the client —
   `verifyToken` is a standalone export of `@clerk/backend`. Every request,
   including one with a perfectly valid Clerk JWT, would throw a `TypeError`,
   get swallowed by the surrounding `try/catch`, and return a generic 401.
   **No user could ever have logged in**, on any version. Fixed to
   `import { verifyToken } from "@clerk/backend"`, called directly with
   `{ secretKey }`. Verified by booting the real server and hitting
   `/api/v1/auth/sync` and `/api/v1/users/me` — both correctly reach real
   Clerk token verification and reject bogus tokens with `401`, instead of
   crashing.

2. **`prisma generate` was silently corrupting the mobile app's `package.json`.**
   `prisma/` lived at the repo root, a *sibling* of `backend/`. Prisma's
   auto-install-missing-dependency logic resolves relative to the schema
   file's own directory (walking up its ancestor tree), not the process's
   CWD — so on every fresh `db:generate` it installed `@prisma/client` and
   `prisma` into the **root (mobile) `package.json`**, not `backend/package.json`.
   Reproduced twice before diagnosing it. The same root cause meant
   `scripts/promote-admin.ts`, run exactly as documented
   (`cd backend && npx ts-node ../scripts/promote-admin.ts`), failed with
   `Cannot find module '@prisma/client'` — confirmed by actually running it.
   **Fix:** moved `prisma/` and `scripts/` into `backend/` (Prisma's own
   conventional layout). No `--schema` flag or `package.json#prisma` field
   needed anywhere anymore; this also removes the "deprecated, will be
   removed in Prisma 7" warning that field was producing.

3. **`tsc` failures in existing screen/route code**, found by actually running
   the compiler, not by inspection:
   - `backend/routes/messages.routes.ts`: `["COMMITTEE","DM"] as const[]` is
     not valid TypeScript syntax — a real syntax error, not a version issue.
   - `backend/routes/webhook.routes.ts`: Stripe's `apiVersion` literal type
     rejected the stale `"2024-06-20"` value.
   - `src/screens/ProfileScreen.tsx`: imported `useSignOut` from
     `@clerk/clerk-expo`, which isn't exported by any current version.
     Replaced with `useAuth()` (exposes `signOut`).
   - `src/screens/ChannelMessagesScreen.tsx`: referenced a `styles.bubbleOther`
     key never defined in the `StyleSheet`.
   - `src/hooks/usePermissions.ts`: `ScopedEvent.committeeId: string | null`
     didn't accept the `string | null | undefined` shape of the `EventSummary`
     type actually passed in from screens.
   - Root `tsconfig.json`'s `include: ["**/*.ts", ...]` pulled
     `prisma/seed.ts` and `scripts/promote-admin.ts` into the mobile app's
     typecheck scope, where `@prisma/client` was never installed.

4. **Missing files referenced by the repo's own docs:** root `.env.example`
   and root `.gitignore` did not exist at all before this pass (despite
   `docs/PROJECT_STRUCTURE.md` explicitly describing both).

---

## Verification actually performed

| Check | Result | How verified |
|---|---|---|
| `npm install` (root) | ✅ Pass | Full clean install (`rm -rf node_modules package-lock.json && npm install`), 0 ERESOLVE errors |
| `npm install` (backend) | ✅ Pass | Same, from a clean state |
| Dependency tree resolves | ✅ Pass | No `--legacy-peer-deps`/`--force` used anywhere |
| `npm audit` (root) | ⚠️ 1 high fixed, 23 moderate remain | High-severity Clerk advisory resolved by version bump (see above). Remaining 23 moderate findings are transitive, dev-tooling-only (`xcode`→`uuid` inside `@expo/config-plugins`'s iOS prebuild path, and an unused Solana wallet-adapter chain pulled in by `@clerk/clerk-js`'s optional crypto-wallet sign-in feature, which this app doesn't use). Fixing them requires `npm audit fix --force`, which downgrades to `expo@46` — a regression, not a fix. Documented as a known/accepted issue below. |
| `npm audit` (backend) | ✅ 0 vulnerabilities | — |
| TypeScript compiles (mobile) | ✅ Pass | `npx tsc --noEmit` → exit 0, after fixing 5 real errors (above) |
| TypeScript compiles (backend) | ✅ Pass | `npx tsc --noEmit` → exit 0, after fixing 2 real errors (above) |
| Backend production build | ✅ Pass | `npm run build` (`tsc` → `dist/`) completes cleanly |
| `expo-doctor` | ✅ 20/20 checks pass | Fixed: `app.json`'s deprecated top-level `splash` key (moved to the `expo-splash-screen` config plugin, SDK 57's required approach), missing `react-dom` peer, TypeScript version mismatch |
| Metro bundles the app (iOS) | ✅ Pass | `npx expo export --platform ios` → `App.tsx (1429 modules)` bundled with 0 errors |
| Metro bundles the app (Android) | ✅ Pass | `npx expo export --platform android` → `App.tsx (1432 modules)` bundled with 0 errors |
| Prisma schema valid | ✅ Pass | `npx prisma validate` |
| Prisma client generates | ✅ Pass | `npx prisma generate` — and confirmed it **no longer** touches the root `package.json` |
| Schema → SQL translation | ✅ Pass | `npx prisma migrate diff --from-empty --to-schema-datamodel` — produces valid PostgreSQL DDL for every model/enum/index |
| **Real migration against a live database** | ✅ Pass | Spun up a real, local PostgreSQL 18.4 instance (via the `embedded-postgres` npm package, since no Docker/system Postgres was available in this environment) and ran `npx prisma migrate dev --name init` against it for real. Succeeded; migration committed at `backend/prisma/migrations/20260708014740_init/`. |
| **Real seed script** | ✅ Pass | `npm run db:seed` against the same live database — created the Semester, GENERAL, and OFFICERS rows exactly as designed. |
| **Real backend boot** | ✅ Pass | `npm run dev` against the live, migrated, seeded database. `GET /health` → `{"ok":true,...}`. |
| **Real auth-middleware exercise** | ✅ Pass | `GET /api/v1/users/me` (no token) → 401; (bogus token) → 401 `"Invalid or expired token"`, **not a 500 crash** — proves the fixed `verifyToken` call path is live and correctly wired, both in `authMiddleware` and in `POST /api/v1/auth/sync`. |
| Stripe webhook lazy-init | ✅ Pass | `POST /api/v1/webhooks/stripe` with no `STRIPE_SECRET_KEY` set → `503` (documented, expected behavior), not a crash |
| `promote-admin.ts` script | ✅ Pass (up to DB) | Runs exactly as documented from `backend/`, resolves `@prisma/client` correctly (the pre-fix version failed here), fails only at the DB-connection step when pointed at a nonexistent host — the correct behavior for that test |

### Not verified (sandbox limitation, disclosed rather than assumed)
This environment has no Docker, no system package manager (`brew`/`apt`), and no
pre-existing PostgreSQL install. All database-dependent verification above was
still performed for real, using a temporary embedded PostgreSQL 18.4 instance
downloaded via the `embedded-postgres` npm package for the duration of this
session — that instance was torn down afterward and is not part of the shipped
repository. A brand-new developer following `BUILD.md` will use their own Docker
container or local Postgres install per Step 1; that exact flow (create DB →
`db:generate` → `db:migrate:dev` → `db:seed` → `npm run dev`) is what was just
exercised end-to-end above, just against a differently-provisioned Postgres.

**Not exercised in this pass:** the actual Expo Go mobile client, a real Clerk
application (OAuth requires real Google/Clerk credentials), and a real Stripe
account. These require external accounts/devices this environment cannot
provision. Everything up to that boundary — bundling, server boot, auth
middleware wiring, database schema/migrations — was verified for real.

---

## Remaining known issues

- **23 moderate `npm audit` findings on the mobile app**, all transitive and
  build-tooling-only: `uuid`/`xcode` inside `@expo/config-plugins`'s iOS
  prebuild path, and an unused Solana wallet-adapter chain pulled in by
  `@clerk/clerk-js`'s optional web crypto-wallet sign-in feature (not used by
  this app, and dead code on native platforms). No fix exists that doesn't
  downgrade Expo to SDK 46. Recommend re-checking `npm audit` after each
  Expo/Clerk minor bump rather than forcing a fix now.
- **Expo SDK 57 is ~1 week old** as of this validation. It was chosen
  deliberately (see table above) because Expo Go only runs the current SDK,
  but it also means less real-world mileage than an older SDK. If Expo Go
  compatibility becomes a non-issue for your workflow (e.g. you always use
  development builds via EAS instead of Expo Go), SDK 54 is a more
  battle-tested alternative — it was also confirmed compatible with this
  codebase during evaluation, just not chosen as the default.
- **No automated test suite exists** (per `TESTING.md`, this was always a
  manual test plan for the MVP) — this pass did not add one; out of scope
  for a dependency/config repair.
- **Live Expo Go / real Clerk / real Stripe were not exercised**, as noted
  above — they require credentials and a physical device this sandboxed
  environment does not have.
