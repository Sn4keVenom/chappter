# ChapterHub — Build & Deployment Guide

**Stack:** Node.js 20+ · Express · Prisma 6 · PostgreSQL 16 · Expo SDK 57 · React Native 0.86
**Last validated:** 2026-07-07

> **Just want to see the app?** None of this is required. `npm install && npm start`
> launches straight into Demo Mode — a fully interactive mock chapter, no
> Clerk/Postgres/backend needed. See [docs/DEMO_MODE.md](docs/DEMO_MODE.md).
> Everything below is for connecting the real backend.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20.19+, 22.13+, or 24.3+ | https://nodejs.org |
| npm | 10+ | bundled with Node |
| PostgreSQL | 16 | see §1 below |
| Expo Go app (phone) | latest | App Store / Play Store |
| Clerk account | free tier | https://clerk.com |

---

## Repository Structure

```
chapterhub/                ← repo root = the Expo mobile app (run npm commands here)
├── package.json
├── App.tsx                ← root entry point (ClerkProvider + providers)
├── src/
│   ├── navigation/
│   ├── screens/
│   ├── store/
│   └── api/
└── backend/                ← Node.js API server — separate package, own node_modules
    ├── package.json
    ├── server.ts
    ├── routes/
    ├── middleware/
    ├── lib/
    ├── prisma/              ← schema.prisma, seed.ts, migrations/
    └── scripts/             ← promote-admin.ts
```

> **Important:** The mobile app and the backend are two independent npm packages.
> Run mobile commands (`npm install`, `npm start`) from the **repo root**.
> Run backend commands (`npm install`, `npm run dev`, `npm run db:*`) from **`backend/`**.
> `prisma/` lives inside `backend/` — the schema is auto-discovered, no `--schema` flag needed.

---

## Step 1 — Database

### Option A: Docker (recommended)

```bash
docker run -d \
  --name chapterhub-db \
  -e POSTGRES_USER=chapterhub \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=chapterhub_dev \
  -p 5432:5432 \
  postgres:16

# Verify it's running
docker ps | grep chapterhub-db
```

### Option B: Local PostgreSQL

```sql
-- In psql as a superuser:
CREATE USER chapterhub WITH PASSWORD 'changeme';
CREATE DATABASE chapterhub_dev OWNER chapterhub;
```

---

## Step 2 — Clerk Setup

1. Create a free account at https://clerk.com
2. Create a new **Application** → choose any name
3. Under **User & Authentication → Social connections**, enable **Google**
4. Go to **API Keys** and copy:
   - **Secret key** (starts with `sk_test_...`) → used by backend
   - **Publishable key** (starts with `pk_test_...`) → used by mobile

---

## Step 3 — Backend Setup

All commands run from the `backend/` directory.

```bash
# 1. Enter backend directory
cd backend

# 2. Copy and fill environment variables
cp .env.example .env
```

Open `.env` and set at minimum:
```
DATABASE_URL="postgresql://chapterhub:changeme@localhost:5432/chapterhub_dev"
CLERK_SECRET_KEY="sk_test_..."
```

Leave `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` empty for now — the server
will start fine without them. They are only needed when testing Stripe dues payments.

```bash
# 3. Install dependencies
npm install

# 4. Generate Prisma client (reads backend/prisma/schema.prisma automatically)
npm run db:generate

# 5. Create database tables
npm run db:migrate:dev
# When prompted for a migration name, type: init
# (A validated `init` migration already ships in backend/prisma/migrations/ —
#  this step just applies it. It only prompts for a name if you've changed the schema.)

# 6. Seed baseline data (Semester row, GENERAL + OFFICERS channels)
npm run db:seed

# 7. Start the server
npm run dev
```

**Expected output:**
```
ChapterHub API → http://localhost:4000
```

**Verify:**
```bash
curl http://localhost:4000/health
# {"ok":true,"ts":"2026-..."}
```

---

## Step 4 — Mobile Setup

All commands run from the **repo root**.

```bash
# 1. From the repo root, copy and fill environment variables
cp .env.example .env
```

Open `.env` and set:
```
# Turns off Demo Mode so the app uses real Clerk auth and talks to the
# backend below instead of local mock data.
EXPO_PUBLIC_DEMO_MODE="false"

# Your machine's LAN IP address — NOT localhost (won't work on physical devices)
# Find it: macOS → System Preferences → Network | Windows → ipconfig
EXPO_PUBLIC_API_URL="http://192.168.1.x:4000/api/v1"

EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

```bash
# 2. Install dependencies
npm install

# 3. Start Expo
npm start
```

- **Physical device:** Install [Expo Go](https://expo.dev/go) and scan the QR code.
  Device and development machine must be on the same Wi-Fi network.
  If on a university/corporate network with client isolation, use a personal hotspot.
- **iOS Simulator:** Press `i` (requires Xcode)
- **Android Emulator:** Press `a` (requires Android Studio)

This is a phone-only app — there is no web or desktop target.

---

## Step 5 — First Login

1. Open Expo Go → scan the QR from `npm start`
2. Tap **Continue with Google**
3. Complete OAuth in the browser sheet
4. You arrive at the **Home Dashboard**

**If login fails, check:**

| Symptom | Cause | Fix |
|---|---|---|
| App shows blank white screen | `App.tsx` not loading | Verify `App.tsx` exists at the repo root |
| "publishableKey" error | Clerk not configured | Check `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in root `.env` |
| Network timeout on sync | Wrong API URL | Use your LAN IP, not `localhost` |
| 401 "Invalid token" | Key mismatch | Ensure `sk_test_` and `pk_test_` are from the same Clerk application |
| 400 on `/auth/sync` | Validation error | Check backend logs for the specific field |

**Promote yourself to admin** after first login:

```bash
# From backend/ directory
npx prisma studio
```

Find your User row → change `role` to `SUPER_ADMIN` → save → restart app.

Alternatively, from `backend/`:
```bash
DATABASE_URL="..." npx tsx scripts/promote-admin.ts you@example.com
```

---

## Step 6 — Verify Core Flows

### Create an event (requires Officer/Exec role)
Events tab → FAB (➕) → fill form → Create Event

### RSVP
Events tab → tap event → tap Going/Maybe/Not Going

### Member check-in
Events tab → tap an active event → tap **Check In** → allow camera → scan QR

### Officer check-in display
Events tab → tap event → tap **Open Check-In** → show QR to members

> **Note:** Officers can only display QR codes for their own committee's events.
> Chapter-wide events (no committee) require Exec role. This is by design per the product spec.

### Send a message
Messages tab → tap #general → type → send

### Dues (requires Exec — via API for MVP)
```bash
# Initialize dues for the current semester (get semesterId from prisma studio)
curl -X POST http://localhost:4000/api/v1/dues/initialize \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"semesterId":"<id>","amountOwed":150}'
```

---

## Database Commands (run from `backend/`)

```bash
# Open browser UI to view/edit data
npx prisma studio

# Reset all data and re-run migrations (DESTRUCTIVE)
npx prisma migrate reset

# Re-seed after reset
npm run db:seed

# Generate a new migration after schema changes
npm run db:migrate:dev
# (type a descriptive name when prompted)

# Check migration status
npx prisma migrate status
```

---

## Known Limitations

| Limitation | Workaround |
|---|---|
| Stripe dues payments need STRIPE_SECRET_KEY | Set in `.env` + run `stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe` |
| MemberProfile, AuditLog, Thread screens show blank | Known stub — navigate away |
| No push notifications | Phase 4 |
| Chapter-wide events require Exec for QR display | Create events with a committee assigned, or use Exec role |

---

## Production Deployment (Checklist)

- [ ] Backend: deploy to Render / Railway / Fly.io; set all env vars
- [ ] Run `npm run db:migrate` as a release step (not `migrate:dev`)
- [ ] Run seed once on fresh DB
- [ ] Set `CORS_ORIGIN` to production domain(s)
- [ ] Register Stripe webhook endpoint at `https://yourdomain.com/api/v1/webhooks/stripe`
- [ ] Mobile: `eas build --profile production` → submit to App Store / Play Store
- [ ] Update `EXPO_PUBLIC_API_URL` to production backend URL
