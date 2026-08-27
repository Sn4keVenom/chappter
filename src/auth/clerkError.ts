// src/auth/clerkError.ts
//
// Turns a thrown Clerk error into something worth showing a member.
//
// ── Why not just read .message ────────────────────────────────────────────
// ClerkAPIError carries two human-readable fields and they are NOT
// interchangeable. `message` is a sentence *fragment*, written to be joined
// to a field label by whoever renders it — for a rejected parameter it is the
// literal string "is unknown", which on its own tells the reader nothing and
// hides which field was at fault (that lives in meta.paramName).
// `longMessage` is the standalone sentence: "username is not a valid
// parameter for this request."
//
// Every auth screen used to read `.message` directly, so a Clerk instance
// missing an enabled attribute surfaced to the user as a banner reading
// exactly "is unknown" — see the sign-up form, which sends username and
// firstName/lastName and therefore needs Username and Name enabled on the
// instance (Dashboard → User & authentication → User model).
//
// Order: longMessage, then message for the errors that only set it, then the
// caller's own copy for throws that aren't Clerk API errors at all — a
// network failure, an aborted request. `||` rather than `??` so an empty
// string falls through too.

interface ClerkLikeError {
  errors?: Array<{ longMessage?: string; message?: string }>;
}

export function clerkErrorMessage(err: unknown, fallback: string): string {
  const first = (err as ClerkLikeError | null | undefined)?.errors?.[0];
  return first?.longMessage?.trim() || first?.message?.trim() || fallback;
}
