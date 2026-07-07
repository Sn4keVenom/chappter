# ChapterHub

**Theta Tau Chapter Operations Platform**

A mobile-first fraternity management app built with Expo (React Native) and a Node.js/Express backend. Handles event management, QR check-in, points tracking, committee messaging, and dues collection.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/chapterhub.git
cd chapterhub

# Mobile app
cp .env.example .env          # fill in Clerk publishable key + API URL
npm install
npm start                     # starts Expo; scan QR with Expo Go

# Backend (separate terminal)
cp backend/.env.example backend/.env   # fill in DATABASE_URL + CLERK_SECRET_KEY
npm run backend               # starts API server on port 4000
```

See [BUILD.md](BUILD.md) for complete setup instructions.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 51 · React Native 0.74 · TypeScript |
| Auth | Clerk (Google OAuth via SSO) |
| State | Zustand |
| Navigation | React Navigation v6 |
| Backend | Node.js 20 · Express · TypeScript |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Payments | Stripe (optional) |

## Project Structure

```
chapterhub/           ← repository root = Expo mobile app
├── App.tsx           ← entry point
├── src/              ← all mobile source
│   ├── api/          ← HTTP client modules
│   ├── navigation/   ← React Navigation setup
│   ├── screens/      ← screen components
│   ├── store/        ← Zustand state
│   ├── hooks/        ← custom hooks
│   ├── theme/        ← colors palette
│   └── types/        ← TypeScript types
├── backend/          ← Express API server
│   ├── routes/       ← route handlers
│   ├── middleware/   ← auth + RBAC
│   └── lib/          ← shared utilities
├── prisma/           ← database schema + seed
└── assets/           ← app icons + splash
```

## Documentation

| File | Purpose |
|---|---|
| [BUILD.md](BUILD.md) | Setup instructions for macOS and Windows |
| [TESTING.md](TESTING.md) | Test plan and manual test cases |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Directory and file reference |

## Roles

| Role | Permissions |
|---|---|
| MEMBER | RSVP, check-in (QR scan), view points/dues |
| OFFICER | Everything above + manage own committee events, view check-in roster |
| EXEC | Everything above + create chapter-wide events, manage dues, send reminders |
| SUPER_ADMIN | Everything above + manage roles, view audit log |

## License

MIT © Theta Tau Chapter
