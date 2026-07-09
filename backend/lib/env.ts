// backend/lib/env.ts
//
// Validates required environment variables at process boot, before any
// route can be hit. Without this, a missing DATABASE_URL or
// CLERK_SECRET_KEY doesn't fail until the first request touches Prisma or
// Clerk — a confusing runtime error deep in a request handler instead of a
// clear, immediate startup failure. Import this for its side effect only,
// as the very first line of server.ts.
//
// Stripe vars are intentionally NOT validated here — they're genuinely
// optional (see routes/webhook.routes.ts getStripe(), which lazy-throws a
// clear 503 if a Stripe webhook arrives before they're configured).

const REQUIRED_VARS = ["DATABASE_URL", "CLERK_SECRET_KEY"] as const;

const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

if (missing.length > 0) {
  // Thrown synchronously at import time — Node exits before `app.listen`
  // ever runs, so there's no window where the server appears "up" but
  // every request 500s.
  throw new Error(
    `Missing required environment variable(s): ${missing.join(", ")}. ` +
      `Copy backend/.env.example to backend/.env and fill them in.`
  );
}

if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn(
    "[ChapterHub] STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not set — " +
      "Stripe dues payments are disabled until both are configured."
  );
}

if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
  console.warn(
    "[ChapterHub] CLERK_WEBHOOK_SIGNING_SECRET not set — the /webhooks/clerk " +
      "endpoint will reject every delivery with 503 until it's configured " +
      "(Clerk Dashboard → Webhooks → your endpoint → Signing Secret)."
  );
}
