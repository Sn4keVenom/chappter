# ChapterHub

**Theta Tau Chapter Operations Platform**

A mobile-first fraternity management app built with Expo (React Native) and a Node.js/Express backend. Handles event management, QR check-in, points tracking, committee messaging, and dues collection.

## Quick Start — Demo Mode (default, no setup required)

```bash
git clone https://github.com/your-org/chapterhub.git
cd chapterhub
npm install
npm start                     # starts Expo; scan QR with Expo Go
```

That's it — no `.env` file, no Clerk account, no database, no backend. The
app launches straight into a fully interactive mock chapter with realistic
members, events, dues, and messages. See [docs/DEMO_MODE.md](docs/DEMO_MODE.md).

## Running against the real backend

```bash
# Mobile app
cp .env.example .env          # set EXPO_PUBLIC_DEMO_MODE=false, fill in Clerk key + API URL
npm install
npm start

# Backend (separate terminal)
cp backend/.env.example backend/.env   # fill in DATABASE_URL + CLERK_SECRET_KEY
npm run backend               # starts API server on port 4000
```

See [BUILD.md](BUILD.md) for complete setup instructions.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript 6 |
| Auth | Clerk (Google OAuth via SSO) |
| State | Zustand 5 |
| Navigation | React Navigation v7 |
| Backend | Node.js 20+ · Express 4 · TypeScript 6 |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Payments | Stripe (optional) · Pyli (dues, self-service) |
| Calendar | expo-calendar (device calendar) + Google/Outlook web links + ICS export |

## Project Structure

```
chapterhub/           ← repository root = Expo mobile app (phone only — no web/Electron)
├── App.tsx           ← entry point
├── src/              ← all mobile source
│   ├── config/       ← DEMO_MODE flag
│   ├── mocks/        ← Demo Mode mock data + API layer (see docs/DEMO_MODE.md)
│   ├── api/          ← HTTP client modules
│   ├── navigation/   ← React Navigation setup
│   ├── screens/      ← screen components
│   ├── store/        ← Zustand state
│   ├── hooks/        ← custom hooks
│   ├── theme/        ← colors palette
│   ├── utils/        ← achievements + other pure client-side helpers
│   └── types/        ← TypeScript types
├── backend/          ← Express API server (separate npm package)
│   ├── routes/       ← route handlers
│   ├── middleware/   ← auth + RBAC
│   ├── lib/          ← shared utilities
│   ├── prisma/       ← database schema, seed, migrations
│   └── scripts/      ← one-off admin scripts
└── assets/           ← app icons + splash
```

## Documentation

| File | Purpose |
|---|---|
| [docs/DEMO_MODE.md](docs/DEMO_MODE.md) | How Demo Mode works, what's mocked, how to reconnect the real backend |
| [BUILD.md](BUILD.md) | Setup instructions for the real backend (macOS and Windows) |
| [TESTING.md](TESTING.md) | Test plan and manual test cases |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Directory and file reference |

## Roles, Offices & Permissions

Roles are permission *presets*, not the permissions themselves — a Super
Admin can edit exactly what each role can do from the app's Permissions
screen (Admin tab → Chapter Administration → Permissions). Defaults:

| Role | Default access |
|---|---|
| PNM | View events, view documents, post messages — prospective-member view |
| ALUMNI | View events, view documents, post messages — alumni view |
| MEMBER | Everything above + take attendance (self check-in), full messaging |
| EXEC | Everything above + create/edit/delete events, manage attendance, award/deduct points, manage committees/dues/teams/documents/feedback |
| SUPER_ADMIN | Unrestricted — always bypasses the permission table, plus exclusive access to Chapter Settings, Modules, and Permissions themselves |

**Exec Office** (Regent, Vice Regent, Treasurer, Scribe, Marshal,
Corresponding Secretary, New Member Educator) is a separate, independent
field from role — it's a label for who holds a named position, and never
by itself grants access. Committee chairs are tracked via committee
membership, independent of both role and office.

See [docs/PERMISSIONS.md](docs/PERMISSIONS.md) for the full permission list
and [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for how the
system is implemented.

## License

MIT © Theta Tau Chapter
