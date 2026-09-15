// backend/lib/push.ts
//
// "Add push notifications (mobile and desktop)." Web Push (RFC 8030), not a
// native push service — this is a PWA (see the manifest work, commit
// 18e1ba2), not a wrapped native app, so there's no APNs/FCM project to
// register with. Works identically on a phone that's added the app to its
// home screen and a laptop with the site open in a background tab.
//
// v1 trigger surface is deliberately narrow: a new chapter-wide announcement
// (messaging.announce — see routes/messages.routes.ts) is the one thing that
// pushes today. Broader triggers (every DM, every RSVP reminder) risk
// notification fatigue if wrong and are easy to add later against this same
// sendPushToChapter/sendPushToUser pair — starting narrow beats guessing.
//
// Requires VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT (see env.ts's
// warning if unset). Generate a pair once with `npx web-push
// generate-vapid-keys` and put them in .env — they identify THIS server to
// push services (Chrome's, Apple's, etc.), not any one subscription.

import webpush from "web-push";
import { prisma } from "./prisma";

const vapidReady = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

if (vapidReady) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

export function isPushConfigured(): boolean {
  return vapidReady;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where notificationclick (public/sw-push.js) should take them. */
  url?: string;
}

/** Sends to every subscription (a person can have one per device) for one
 * user, pruning any the push service reports as gone (410/404 — the
 * subscription expired or was revoked client-side, e.g. they cleared site
 * data) rather than leaving dead rows to keep failing forever. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!vapidReady) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleIds.push(sub.id);
        }
        // Any other failure (network blip, push service hiccup) is left
        // alone — not this subscription's fault, don't punish it for a
        // transient error the way a confirmed-gone one is pruned.
      }
    })
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }
}

/** Fans out to every ACTIVE member of a chapter who has push enabled,
 * excluding one user (the poster, who doesn't need their own announcement
 * pushed back at them). Failures for one member's subscriptions never block
 * another's — each sendPushToUser call is independent. */
export async function sendPushToChapter(
  chapterId: string,
  payload: PushPayload,
  excludeUserId?: string
): Promise<void> {
  if (!vapidReady) return;

  const memberships = await prisma.chapterMembership.findMany({
    where: {
      chapterId,
      status: { in: ["ACTIVE", "PNM"] },
      userId: excludeUserId ? { not: excludeUserId } : undefined,
      user: { deletedAt: null },
    },
    select: { userId: true },
  });

  await Promise.all(memberships.map((m) => sendPushToUser(m.userId, payload)));
}
