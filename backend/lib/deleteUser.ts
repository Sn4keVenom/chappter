// backend/lib/deleteUser.ts
//
// One implementation of "delete an account," shared by everything that can
// trigger it: the Clerk user.deleted webhook (webhook.routes.ts), the
// self/admin delete routes (users.routes.ts), and the manual
// delete-user.ts script (for the one case none of those cover — a Clerk
// account that's already gone, e.g. removed by hand from the Dashboard,
// with only the local row left to clean up).

import { createClerkClient } from "@clerk/backend";
import { prisma } from "./prisma";

let _clerk: ReturnType<typeof createClerkClient> | null = null;
function clerkClient() {
  if (!_clerk) _clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  return _clerk;
}

/** The local-DB half of deletion: sets deletedAt and rewrites email/
 * username to a `deleted-<id>` placeholder so the originals free up for
 * reuse (both columns are unique). Deliberately never touches
 * ChapterMembership — see schema.prisma's User.deletedAt doc comment
 * (AuditLog/Attendance/Message/etc. aren't all cascade-safe for a record
 * chapters rely on for history) and, concretely, ChapterRosterEntry.
 * createdById is ON DELETE RESTRICT: touching that membership at all would
 * make Postgres reject the change outright for anyone who's ever run a
 * roster Bulk Import. Idempotent — returns false if already deleted, so
 * every caller (including a Clerk webhook retry) is safe to call more than
 * once. */
export async function softDeleteLocalUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return false;

  const placeholder = `deleted-${user.id}`;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      deletedAt: new Date(),
      email: `${placeholder}@deleted.chappter.invalid`,
      username: placeholder,
    },
  });
  return true;
}

/** Full account deletion, for a live account that's actually being deleted
 * right now (as opposed to delete-user.ts's case, where Clerk's half is
 * already done). Removes the Clerk account first — so the email frees up
 * on Clerk's side too, and sign-in stops working immediately even if this
 * request never reaches the webhook — then soft-deletes the local row in
 * the same call, rather than depending on that webhook round-trip (it's
 * optional/unconfigured on some deployments; see delete-user.ts). Clerk's
 * own webhook still fires afterward and calls softDeleteLocalUser() again
 * — a harmless no-op by then. */
export async function deleteUserAccount(user: { id: string; authProviderId: string }): Promise<void> {
  try {
    await clerkClient().users.deleteUser(user.authProviderId);
  } catch (err: any) {
    // Already gone on Clerk's side (a previous partial attempt, or removed
    // by hand from the Dashboard) is the goal state already reached, not a
    // failure — anything else should still surface.
    if (err?.status !== 404) throw err;
  }
  await softDeleteLocalUser(user.id);
}
