# ChapterHub — Build & Deployment Guide

**Stack:** Node.js 20 · Express · Prisma · PostgreSQL 16 · Expo SDK 51 · React Native 0.74  
**Last validated:** June 2026

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| npm | 10+ | bundled with Node |
| PostgreSQL | 16 | see §1 below |
| Expo Go app (phone) | latest | App Store / Play Store |
| Clerk account | free tier | https://clerk.com |

---

## Repository Structure

```
chapterhub/               ← repo root
├── backend/              ← Node.js API server (run npm commands from here)
│   ├── package.json
│   ├── server.ts
│   ├── routes/
│   ├── middleware/
│   └── lib/
├── prisma/               ← Prisma schema and seed (shared, at repo root)
│   ├── schema.prisma
│   └── seed.ts
├── mobile/               ← Expo React Native app (run npm commands from here)
│   ├── package.json
│   ├── App.tsx           ← root entry point (ClerkProvider + providers)
│   ├── navigation/
│   ├── screens/
│   ├── store/
│   └── api/
└── BUILD.md              ← this file
```

> **Important:** The `prisma/` directory is at the **repo root**, not inside `backend/`.
> All backend package.json scripts already include `--schema=../prisma/schema.prisma`.
> Run all backend commands from inside `backend/`.

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

# 4. Generate Prisma client (reads ../prisma/schema.prisma)
npm run db:generate

# 5. Create database tables
npm run db:migrate:dev
# When prompted for a migration name, type: init

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

All commands run from the `mobile/` directory.

```bash
# 1. Enter mobile directory
cd mobile

# 2. Copy and fill environment variables
cp .env.example .env
```

Open `.env` and set:
```
# Your machine's LAN IP address — NOT localhost (won't work on physical devices)
# Find it: macOS → System Preferences → Network | Windows → ipconfig
EXPO_PUBLIC_API_URL="http://192.168.1.x:4000/api/v1"

EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

```bash
# 3. Install dependencies
npm install

# 4. Start Expo
npx expo start
```

- **Physical device:** Install [Expo Go](https://expo.dev/go) and scan the QR code.
  Device and development machine must be on the same Wi-Fi network.
  If on a university/corporate network with client isolation, use a personal hotspot.
- **iOS Simulator:** Press `i` (requires Xcode)
- **Android Emulator:** Press `a` (requires Android Studio)

---

## Step 5 — First Login

1. Open Expo Go → scan the QR from `npx expo start`
2. Tap **Continue with Google**
3. Complete OAuth in the browser sheet
4. You arrive at the **Home Dashboard**

**If login fails, check:**

| Symptom | Cause | Fix |
|---|---|---|
| App shows blank white screen | `App.tsx` not loading | Verify `mobile/App.tsx` exists |
| "publishableKey" error | Clerk not configured | Check `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in mobile `.env` |
| Network timeout on sync | Wrong API URL | Use your LAN IP, not `localhost` |
| 401 "Invalid token" | Key mismatch | Ensure `sk_test_` and `pk_test_` are from the same Clerk application |
| 400 on `/auth/sync` | Validation error | Check backend logs for the specific field |

**Promote yourself to admin** after first login:

```bash
# From backend/ directory
npx prisma studio --schema=../prisma/schema.prisma
```

Find your User row → change `role` to `SUPER_ADMIN` → save → restart app.

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
npx prisma studio --schema=../prisma/schema.prisma

# Reset all data and re-run migrations (DESTRUCTIVE)
npx prisma migrate reset --schema=../prisma/schema.prisma

# Re-seed after reset
npm run db:seed

# Generate a new migration after schema changes
npm run db:migrate:dev
# (type a descriptive name when prompted)

# Check migration status
npx prisma migrate status --schema=../prisma/schema.prisma
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
