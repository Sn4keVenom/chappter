// src/config/demo.ts
//
// Demo Mode lets ChapterHub run with zero external dependencies — no Clerk
// account, no PostgreSQL, no Express backend. It is ON BY DEFAULT so a fresh
// clone launches straight into a fully mocked experience: `npm install` +
// `npm start` + Expo Go/Simulator, nothing else.
//
// Every screen, store, and src/api/*.ts function is completely unchanged
// between demo and live mode — this flag only controls what the axios
// instance in src/api/client.ts does under the hood (see src/mocks/router.ts,
// which supplies a custom axios `adapter` that answers requests from local
// mock data instead of the network). Reconnecting the real backend later is
// a config change, not a code change.
//
// To reconnect the real backend:
//   1. Set EXPO_PUBLIC_DEMO_MODE=false in your .env (see .env.example)
//   2. Provide EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_API_URL
//   3. Run the backend per BUILD.md
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE !== "false";
