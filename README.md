# Chappter

**Theta Tau Chapter Operations Platform**

A mobile-first responsive **web app** for fraternity chapter management, with a
Node.js/Express backend. Handles event management, check-in, points tracking,
committee messaging, and dues collection. Nothing to install on a phone — it's
a website.

## Quick Start — Demo Mode (default, no setup required)

```bash
git clone https://github.com/your-org/chappter.git
cd chappter
npm install
npm run dev                   # then open http://localhost:5173
```

That's it — no `.env` file, no Clerk account, no database, no backend, and no
server of any kind: the mock API runs in the page. The app opens straight into
a fully interactive mock chapter with realistic members, events, dues, and
messages. See [docs/DEMO_MODE.md](docs/DEMO_MODE.md) and
[docs/WEB_MIGRATION.md](docs/WEB_MIGRATION.md).

## Running against the real backend

```bash
# Web app
cp .env.example .env          # set VITE_DEMO_MODE=false, fill in the API URL
npm install
npm run dev

# Backend (separate terminal)
cp backend/.env.example backend/.env   # fill in DATABASE_URL + CLERK_SECRET_KEY
npm run backend               # starts API server on port 4000
```

See [BUILD.md](BUILD.md) for complete setup instructions.

## Tech Stack

| Layer | Technology |
|---|---|
| Web | Vite 7 · React 19.2 · TypeScript 5.9 · CSS Modules |
| Auth | Clerk (not yet wired for web — see docs/WEB_MIGRATION.md) |
| State | Zustand 5 |
| Routing | React Router 7 |
| Backend | Node.js 20+ · Express 4 · TypeScript 6 |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Payments | Stripe (optional) · Pyli (dues, self-service) |
| Calendar | ICS download + Google/Outlook web links |

## Project Structure

```
chappter/           ← repository root = the web app
├── index.html        ← document shell
├── src/
│   ├── main.tsx      ← entry point
│   ├── config/       ← DEMO_MODE flag
│   ├── mocks/        ← Demo Mode mock data + API layer (see docs/DEMO_MODE.md)
│   ├── api/          ← HTTP client modules
│   ├── routes/       ← React Router route map + auth guards
│   ├── layouts/      ← app shell, auth shell, settings shell
│   ├── pages/        ← one component per route
│   ├── components/   ← shared UI primitives
│   ├── navigation/   ← role/module-aware navigation model
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
