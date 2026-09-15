// src/api/push.ts
//
// Thin wrapper for the subscribe/unsubscribe calls — see
// src/push/registerPush.ts for the actual browser-side subscription
// mechanics (Notification permission, PushManager, the service worker) that
// call these.

import { apiClient } from "./client";

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

export async function getPushConfig(): Promise<PushConfig> {
  const { data } = await apiClient.get<PushConfig>("/push/config");
  return data;
}

export async function subscribeToPush(subscription: PushSubscriptionJSON): Promise<void> {
  await apiClient.post("/push/subscribe", {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
  });
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  await apiClient.delete("/push/subscribe", { data: { endpoint } });
}
