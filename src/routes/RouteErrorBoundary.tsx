// src/routes/RouteErrorBoundary.tsx
//
// The router's top-level errorElement (see router.tsx). Without this, React
// Router's own default falls back to a raw "Unexpected Application Error!"
// page with a stack trace and no way out except a manual browser reload —
// several people hit exactly that screen after a deploy: every route is
// code-split (router.tsx's `lazy`), and a tab left open from before a new
// build has an old chunk manifest — the hashed filename it tries to fetch
// (e.g. RosterPage-r8Fax5--.js) no longer exists on the server once the new
// build's assets replace it, so the dynamic import() itself throws instead
// of the page ever mounting.
//
// Two things happen here:
//   1. That specific failure mode is self-healing: it's caught, and the tab
//      does ONE automatic hard reload, which fetches the current index.html
//      and therefore the current chunk manifest — invisible to the person
//      the vast majority of the time.
//   2. Anything else (a genuine runtime error, or a chunk error that
//      persists even after the reload) falls through to a plain, on-brand
//      "Something went wrong" screen with a way out that isn't "reload the
//      whole app": Go back retraces one step in history without losing
//      wherever they were trying to get to next.
import { useEffect, useState } from "react";
import { useNavigate, useRouteError } from "react-router-dom";

import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

const RELOAD_AT_KEY = "chappter:chunk-reload-at";
// If the last auto-reload attempt was this recent, the reload didn't fix
// it — a genuinely broken chunk, not a stale one — so don't loop forever.
const RELOAD_COOLDOWN_MS = 15_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isChunkLoadError(message: string): boolean {
  return /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    message
  );
}

export default function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = errorMessage(error);
  const chunkError = isChunkLoadError(message);

  // Only meaningful for a chunk error still within its cooldown window —
  // i.e. we already tried the auto-reload and landed right back here.
  const [reloadExhausted] = useState(() => {
    if (!chunkError) return false;
    const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) ?? 0);
    return Date.now() - last < RELOAD_COOLDOWN_MS;
  });

  useEffect(() => {
    if (!chunkError || reloadExhausted) return;
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
    window.location.reload();
  }, [chunkError, reloadExhausted]);

  // Mid-reload: render nothing rather than flashing the error screen for a
  // frame before the reload takes over.
  if (chunkError && !reloadExhausted) return null;

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-5)",
        background: "var(--color-bg)",
      }}
    >
      <Card style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <span style={{ fontSize: "2rem" }} aria-hidden="true">
          {chunkError ? "🔄" : "⚠️"}
        </span>
        <p style={{ fontWeight: 700, fontSize: "var(--text-lg)", marginTop: "var(--space-3)" }}>
          {chunkError ? "Couldn't load that page" : "Something went wrong"}
        </p>
        <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-2)", lineHeight: 1.5 }}>
          {chunkError
            ? "This usually clears up after a reload. If it keeps happening, check your connection."
            : "You can go back to where you were, or reload the app if that doesn't help."}
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            justifyContent: "center",
            marginTop: "var(--space-4)",
          }}
        >
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </Card>
    </div>
  );
}
