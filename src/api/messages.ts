// src/api/messages.ts
// Cursor-based pagination for messages: `before` is an ISO timestamp
// string; pass oldestTimestamp from the previous response to load older msgs.

import { apiClient } from "./client";
import type { Channel, Message } from "../types";

export async function listChannels(params?: { includeArchived?: boolean }): Promise<Channel[]> {
  const { data } = await apiClient.get<{ channels: Channel[] }>("/channels", { params });
  return data.channels;
}

/** Creates a standing chapter channel. Committee channels aren't created
 * here — they come with their committee (see api/committees.ts). Requires
 * `messaging.manageChannels`. */
export async function createChannel(payload: {
  name: string;
  type: "GENERAL" | "OFFICERS";
}): Promise<Channel> {
  const { data } = await apiClient.post<{ channel: Channel }>("/channels", payload);
  return data.channel;
}

/** Reversible — pass `archived: false` to bring a channel back. Messages are
 * never deleted either way. Requires `messaging.manageChannels`. */
export async function setChannelArchived(channelId: string, archived: boolean): Promise<Channel> {
  const { data } = await apiClient.patch<{ channel: Channel }>(
    `/channels/${channelId}/archive`,
    { archived }
  );
  return data.channel;
}

export async function getChannelMessages(
  channelId: string,
  params?: { before?: string; limit?: number }
): Promise<{
  messages: Message[];
  pinned: Message[];
  hasMore: boolean;
  oldestTimestamp: string | null;
}> {
  const { data } = await apiClient.get(`/channels/${channelId}/messages`, { params });
  return data;
}

export async function getThread(
  channelId: string,
  messageId: string
): Promise<{ parent: Message; replies: Message[] }> {
  const { data } = await apiClient.get(
    `/channels/${channelId}/messages/${messageId}/thread`
  );
  return data;
}

export async function sendMessage(
  channelId: string,
  payload: { content: string; parentMessageId?: string }
): Promise<Message> {
  const { data } = await apiClient.post<{ message: Message }>(
    `/channels/${channelId}/messages`,
    payload
  );
  return data.message;
}

export async function pinMessage(
  messageId: string,
  pinned: boolean
): Promise<Message> {
  const { data } = await apiClient.patch<{ message: Message }>(
    `/messages/${messageId}/pin`,
    { pinned }
  );
  return data.message;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await apiClient.delete(`/messages/${messageId}`);
}
