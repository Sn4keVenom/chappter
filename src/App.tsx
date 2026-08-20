// src/App.tsx
//
// Provider stack, in order:
//   ErrorBoundary  — catches render errors anywhere below
//   ThemeProvider  — writes the palette onto <html>, follows the OS setting,
//                    fetches chapter branding once a chapter is known
//   RouterProvider — browser routing (see routes/router.tsx)

import { RouterProvider } from "react-router-dom";

import ErrorBoundary from "./components/ErrorBoundary";
import ThemeProvider from "./theme/ThemeProvider";
import { router } from "./routes/router";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
