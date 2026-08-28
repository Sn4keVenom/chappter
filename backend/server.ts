// backend/server.ts
//
// Express application entry point.
//
// ── Middleware mount order (ORDER MATTERS) ───────────────────────────────
//
//  1. Raw body capture for the Stripe webhook path ONLY.
//     Must precede express.json() so Stripe's signature check gets the raw
//     bytes, not the parsed JSON object.
//
//  2. helmet() — baseline security headers (disables X-Powered-By,
//     sets X-Content-Type-Options, etc.).
//
//  3. Request logging (morgan) — one line per request, skipped in test.
//
//  4. express.json() + CORS for all other routes.
//
//  5. Rate limiting — applied before auth so unauthenticated brute-force
//     attempts against /auth/sync are throttled too, not just after login.
//
//  6. Health check (no auth needed) — verifies DB connectivity so an
//     orchestrator (Render/Railway/Fly/k8s) can tell "process is up" apart
//     from "process can actually serve requests."
//
//  7. Webhook router — Stripe signature is the auth mechanism here, not our
//     JWT. Mounted before authMiddleware deliberately.
//
//  8. Auth sync router — handles POST /auth/sync, which is called right after
//     Clerk sign-in before a User row exists in the DB. Must be before
//     authMiddleware for this reason.
//
//  9. authMiddleware — verifies the Clerk JWT and populates req.user from the
//     DB User row. Everything below this line requires a valid session.
//
// 10. All authenticated application routers.
//
// 11. 404 handler for anything that reached here unmatched.
//
// 12. Global error handler.
//
// ── Security invariant ───────────────────────────────────────────────────
//  Only two routers are intentionally pre-auth:
//    · webhookRouter  — Stripe HMAC authentication
//    · authRouter     — Clerk JWT verified inline per request

import "./lib/env"; // validates required env vars and fails fast if missing

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { prisma } from "./lib/prisma";
import { authMiddleware } from "./middleware/auth";
import authRouter from "./routes/auth.routes";
import webhookRouter from "./routes/webhook.routes";
import usersRouter from "./routes/users.routes";
import eventsRouter from "./routes/events.routes";
import attendanceRouter from "./routes/attendance.routes";
import committeesRouter from "./routes/committees.routes";
import duesRouter from "./routes/dues.routes";
import messagesRouter from "./routes/messages.routes";
import settingsRouter from "./routes/settings.routes";
import modulesRouter from "./routes/modules.routes";
import documentsRouter from "./routes/documents.routes";
import feedbackRouter from "./routes/feedback.routes";
import permissionsRouter from "./routes/permissions.routes";
import chaptersRouter from "./routes/chapters.routes";
import membershipRouter from "./routes/membership.routes";
import auditLogRouter from "./routes/auditlog.routes";
import teamsRouter from "./routes/teams.routes";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// ── 1. Raw body for Stripe/Clerk webhooks (must precede express.json) ─────
// Both verify a signature computed over the exact raw bytes — express.json()
// would parse and re-serialize the body, which can produce different bytes
// (key order, whitespace) and break signature verification.
app.use(
  ["/api/v1/webhooks/stripe", "/api/v1/webhooks/clerk"],
  express.raw({ type: "application/json" })
);

// ── 2. Security headers ────────────────────────────────────────────────────
app.use(helmet());

// ── 3. Request logging ─────────────────────────────────────────────────────
// "combined" in production (includes remote addr / user agent, useful for
// an aggregator like Render/Railway/Datadog); terser "dev" locally. Skipped
// entirely under test to keep test output readable.
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(isProduction ? "combined" : "dev"));
}

// ── 4. Standard middleware ──────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));

// CORS_ORIGIN must be an explicit comma-separated allowlist in production —
// `credentials: true` combined with a wildcard origin is rejected by
// browsers anyway and is a real misconfiguration smell, not just unused
// permissiveness.
//
// This now matters directly: the client is a web app served from its own
// origin (localhost:5173 in development), so every API call is cross-origin
// and the browser enforces CORS — something the previous mobile client was
// never subject to. Set CORS_ORIGIN to the web app's origin in backend/.env.
const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim());
if (isProduction && !corsOrigin) {
  throw new Error(
    "CORS_ORIGIN must be set in production (comma-separated list of allowed origins)."
  );
}
app.use(
  cors({
    origin: corsOrigin ?? "*",
    credentials: !!corsOrigin,
  })
);

// ── 5. Rate limiting ────────────────────────────────────────────────────────
// Generous defaults for a chapter-sized user base (dozens to low hundreds of
// members hitting a handful of screens) — tight enough to blunt credential
// stuffing / scripted abuse, loose enough that normal app usage (pull to
// refresh, tab switching) never trips it.
app.use(
  "/api/v1",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);
// Auth endpoints get a tighter limit — these are the ones worth throttling
// harder against brute force / token-guessing.
app.use(
  "/api/v1/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);
// /auth/verify-role-number is a name+number enumeration vector — no account
// is required to call it, so it gets a tighter cap layered on top of the
// general /auth limiter above.
app.use(
  "/api/v1/auth/verify-role-number",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// ── 6. Health check — verifies DB connectivity, not just process liveness ──
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, ts: new Date(), db: "ok" });
  } catch (err) {
    console.error("[Chappter] Health check DB probe failed:", err);
    res.status(503).json({ ok: false, ts: new Date(), db: "unreachable" });
  }
});

// ── 7. Stripe webhook (Stripe HMAC auth, not JWT) ─────────────────────────
app.use("/api/v1", webhookRouter);

// ── 8. Auth sync (Clerk JWT verified inline; user row may not exist yet) ──
app.use("/api/v1", authRouter);

// ── 9. JWT authentication — populates req.user for all routes below ────────
app.use("/api/v1", authMiddleware);

// ── 10. Authenticated application routes ───────────────────────────────────
app.use("/api/v1", usersRouter);
app.use("/api/v1", eventsRouter);
app.use("/api/v1", attendanceRouter);
app.use("/api/v1", committeesRouter);
app.use("/api/v1", duesRouter);       // was incorrectly before authMiddleware
app.use("/api/v1", messagesRouter);
app.use("/api/v1", settingsRouter);
app.use("/api/v1", modulesRouter);
app.use("/api/v1", documentsRouter);
app.use("/api/v1", feedbackRouter);
app.use("/api/v1", permissionsRouter);
app.use("/api/v1", chaptersRouter);
app.use("/api/v1", membershipRouter);
app.use("/api/v1", auditLogRouter);
app.use("/api/v1", teamsRouter);

// ── 11. 404 for anything unmatched ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// ── 12. Global error handler ───────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[Chappter]", err.message, err.stack);
    res.status(500).json({ error: "Internal server error" });
  }
);

// Tests import `app` (via supertest) to exercise routes in-process without
// a real socket — binding a real port on import would conflict across
// parallel test files and leave zombie listeners behind. NODE_ENV=test is
// set by tests/setup.ts before this module loads (see vitest.config.ts).
if (process.env.NODE_ENV !== "test") {
  const PORT = Number(process.env.PORT ?? 4000);
  const server = app.listen(PORT, () => {
    console.log(`Chappter API → http://localhost:${PORT}`);
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  // Stop accepting new connections, let in-flight requests finish, then
  // close the Prisma connection pool. Matters for zero-downtime deploys on
  // platforms that send SIGTERM before killing the container (Render,
  // Railway, Fly.io, k8s all do this).
  const shutdown = (signal: string): void => {
    console.log(`[Chappter] ${signal} received, shutting down gracefully…`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Belt-and-suspenders: force-exit if connections don't drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;
