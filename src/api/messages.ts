// src/api/messages.ts
// Cursor-based pagination for messages: `before` is an ISO timestamp
// string; pass oldestTimestamp from the previous response to load older msgs.

import { apiClient } from "./client";
import type { Channel, Message } from "../types";

export async function listChannels(): Promise<Channel[]> {
  const { data } = await apiClient.get<{ channels: Channel[] }>("/channels");
  return data.channels;
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
