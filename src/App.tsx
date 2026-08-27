// src/App.tsx
//
// Provider stack, in order:
//   ErrorBoundary    — catches render errors anywhere below
//   ClerkProvider    — real mode only (see config/demo.ts); Demo Mode's tree
//                      stays exactly as it was, provider-free
//   ClerkTokenBridge — hands api/client.ts a live token getter (real mode)
//   SessionRestore   — turns a persisted Clerk session into useAuthStore
//                      being populated on cold start (real mode)
//   ThemeProvider    — writes the palette onto <html>, follows the OS setting,
//                      fetches chapter branding once a chapter is known
//   RouterProvider   — browser routing (see routes/router.tsx)

import { RouterProvider } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";

import ErrorBoundary from "./components/ErrorBoundary";
import ThemeProvider from "./theme/ThemeProvider";
import { router } from "./routes/router";
import { DEMO_MODE } from "./config/demo";
import { ClerkTokenBridge } from "./auth/ClerkTokenBridge";
import { SessionRestore } from "./auth/SessionRestore";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function AppShell() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      {DEMO_MODE ? (
        <AppShell />
      ) : (
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY ?? ""}>
          <ClerkTokenBridge />
          <SessionRestore />
          <AppShell />
        </ClerkProvider>
      )}
    </ErrorBoundary>
  );
}
