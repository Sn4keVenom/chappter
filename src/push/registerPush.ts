// src/push/registerPush.ts
//
// Browser-side half of "add push notifications" — talks to the Push API
// directly (Notification permission, ServiceWorkerRegistration,
// PushManager) and api/push.ts for the two calls the server needs. Kept out
// of a React hook/component on purpose: SettingsHomePage.tsx (or wherever
// the toggle lands) should be able to call these as plain async functions
// without worrying about the Push API's own async, callback-shaped history.

import { subscribeToPush, unsubscribeFromPush } from "../api/push";

/** True only when every piece this needs actually exists — Safari desktop
 * and any non-HTTPS context (bar localhost) lack one or more of these, and
 * silently doing nothing is worse than being asked to check first. */
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The Push API wants the VAPID public key as a Uint8Array, not the
 * base64url string the server hands back — this is the standard
 * conversion (unpadded base64url → standard base64 → binary). */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  // register() is idempotent — calling it again with the same script URL
  // just resolves with the existing registration instead of erroring.
  return navigator.serviceWorker.register("/sw-push.js");
}

/** True if THIS browser already holds a live push subscription — the
 * source of truth for whether the Settings toggle should read on/off,
 * independent of whatever the server has on file (which could be stale if
 * a subscription silently expired). */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/sw-push.js");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/** Requests Notification permission (a real, one-time browser prompt — this
 * must be called from a user gesture, e.g. a click handler, or the browser
 * silently denies it) and subscribes. Throws with a message worth showing
 * directly if permission is denied or the platform can't do this at all. */
export async function enablePush(publicKey: string): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("Push notifications aren't supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications are blocked — enable them for this site in your browser settings to turn this on.");
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, // required by the spec — every push must show a visible notification
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await subscribeToPush(subscription.toJSON() as PushSubscriptionJSON);
}

export async function disablePush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await unsubscribeFromPush(endpoint);
}
