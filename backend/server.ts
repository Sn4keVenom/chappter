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
//  2. express.json() + CORS for all other routes.
//
//  3. Health check (no auth needed).
//
//  4. Webhook router — Stripe signature is the auth mechanism here, not our
//     JWT. Mounted before authMiddleware deliberately.
//
//  5. Auth sync router — handles POST /auth/sync, which is called right after
//     Clerk sign-in before a User row exists in the DB. Must be before
//     authMiddleware for this reason.
//
//  6. authMiddleware — verifies the Clerk JWT and populates req.user from the
//     DB User row. Everything below this line requires a valid session.
//
//  7. All authenticated application routers.
//
//  8. Global error handler.
//
// ── Security invariant ───────────────────────────────────────────────────
//  Only two routers are intentionally pre-auth:
//    · webhookRouter  — Stripe HMAC authentication
//    · authRouter     — Clerk JWT verified inline per request

import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware/auth";
import authRouter from "./routes/auth.routes";
import webhookRouter from "./routes/webhook.routes";
import usersRouter from "./routes/users.routes";
import eventsRouter from "./routes/events.routes";
import attendanceRouter from "./routes/attendance.routes";
import committeesRouter from "./routes/committees.routes";
import duesRouter from "./routes/dues.routes";
import messagesRouter from "./routes/messages.routes";

const app = express();

// ── 1. Raw body for Stripe webhook (must precede express.json) ────────────
app.use(
  "/api/v1/webhooks/stripe",
  express.raw({ type: "application/json" })
);

// ── 2. Standard middleware ─────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? "*",
    credentials: true,
  })
);

// ── 3. Health check ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── 4. Stripe webhook (Stripe HMAC auth, not JWT) ─────────────────────────
app.use("/api/v1", webhookRouter);

// ── 5. Auth sync (Clerk JWT verified inline; user row may not exist yet) ──
app.use("/api/v1", authRouter);

// ── 6. JWT authentication — populates req.user for all routes below ────────
app.use("/api/v1", authMiddleware);

// ── 7. Authenticated application routes ───────────────────────────────────
app.use("/api/v1", usersRouter);
app.use("/api/v1", eventsRouter);
app.use("/api/v1", attendanceRouter);
app.use("/api/v1", committeesRouter);
app.use("/api/v1", duesRouter);       // was incorrectly before authMiddleware
app.use("/api/v1", messagesRouter);

// ── 8. Global error handler ───────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[ChapterHub]", err.message, err.stack);
    res.status(500).json({ error: "Internal server error" });
  }
);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`ChapterHub API → http://localhost:${PORT}`);
});

export default app;
