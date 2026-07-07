// src/store/useMessagesStore.ts
//
// Integration points:
//   · messages.ts API — listChannels, getChannelMessages, sendMessage, pinMessage
//   · MessagingScreen.tsx — fetchChannels on focus
//   · ChannelMessagesScreen.tsx — fetchMessages, loadMoreMessages, sendMessage, togglePin

import { create } from "zustand";
import { listChannels, getChannelMessages, sendMessage, pinMessage } from "../api/messages";
import type { Channel, Message } from "../types";

interface ChannelCache {
  messages: Message[];
  pinned: Message[];
  hasMore: boolean;
  oldestTimestamp: string | null;
}

interface MessagesState {
  channels: Channel[];
  channelData: Record<string, ChannelCache>;
  loading: boolean;
  error: string | null;

  fetchChannels: () => Promise<void>;
  fetchMessages: (channelId: string) => Promise<void>;
  loadMoreMessages: (channelId: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, parentMessageId?: string) => Promise<void>;
  togglePin: (channelId: string, messageId: string, pinned: boolean) => Promise<void>;
}

function emptyCache(): ChannelCache {
  return { messages: [], pinned: [], hasMore: false, oldestTimestamp: null };
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  channels: [],
  channelData: {},
  loading: false,
  error: null,

  fetchChannels: async () => {
    set({ loading: true, error: null });
    try {
      const channels = await listChannels();
      set({ channels, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err?.message ?? "Failed to load channels" });
    }
  },

  fetchMessages: async (channelId) => {
    set({ loading: true });
    try {
      const result = await getChannelMessages(channelId, { limit: 30 });
      set((state) => ({
        channelData: {
          ...state.channelData,
          [channelId]: {
            messages: result.messages,
            pinned: result.pinned,
            hasMore: result.hasMore,
            oldestTimestamp: result.oldestTimestamp,
          },
        },
        loading: false,
      }));
    } catch (err: any) {
      set({ loading: false, error: err?.message ?? "Failed to load messages" });
    }
  },

  loadMoreMessages: async (channelId) => {
    const cache = get().channelData[channelId] ?? emptyCache();
    if (!cache.hasMore || !cache.oldestTimestamp) return;
    try {
      const result = await getChannelMessages(channelId, {
        before: cache.oldestTimestamp,
        limit: 30,
      });
      set((state) => {
        const existing = state.channelData[channelId] ?? emptyCache();
        return {
          channelData: {
            ...state.channelData,
            [channelId]: {
              messages: [...existing.messages, ...result.messages],
              pinned: result.pinned,
              hasMore: result.hasMore,
              oldestTimestamp: result.oldestTimestamp,
            },
          },
        };
      });
    } catch {
      // Silent — user can scroll down to try again
    }
  },

  sendMessage: async (channelId, content, parentMessageId) => {
    // Grab the current user from the auth store so the optimistic message
    // has the correct sender.id (needed for bubble-side alignment in
    // ChannelMessagesScreen) and sender name.
    const { user } = await import("./useAuthStore").then((m) => ({
      user: m.useAuthStore.getState().user,
    }));

    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      channelId,
      content,
      pinned: false,
      parentMessageId: parentMessageId ?? null,
      createdAt: new Date().toISOString(),
      sender: {
        id: user?.id ?? "pending",
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
      },
      _pending: true,
      _tempId: tempId,
    };

    set((state) => {
      const cache = state.channelData[channelId] ?? emptyCache();
      return {
        channelData: {
          ...state.channelData,
          [channelId]: { ...cache, messages: [tempMessage, ...cache.messages] },
        },
      };
    });

    try {
      const confirmed = await sendMessage(channelId, { content, parentMessageId });

      // Replace temp with confirmed server message
      set((state) => {
        const cache = state.channelData[channelId] ?? emptyCache();
        return {
          channelData: {
            ...state.channelData,
            [channelId]: {
              ...cache,
              messages: cache.messages.map((m) =>
                m._tempId === tempId ? confirmed : m
              ),
            },
          },
        };
      });
    } catch {
      // Revert optimistic message
      set((state) => {
        const cache = state.channelData[channelId] ?? emptyCache();
        return {
          channelData: {
            ...state.channelData,
            [channelId]: {
              ...cache,
              messages: cache.messages.filter((m) => m._tempId !== tempId),
            },
          },
        };
      });
    }
  },

  togglePin: async (channelId, messageId, pinned) => {
    try {
      const updated = await pinMessage(messageId, pinned);
      set((state) => {
        const cache = state.channelData[channelId] ?? emptyCache();
        return {
          channelData: {
            ...state.channelData,
            [channelId]: {
              ...cache,
              messages: cache.messages.map((m) =>
                m.id === messageId ? { ...m, pinned: updated.pinned } : m
              ),
              pinned: pinned
                ? [updated, ...cache.pinned.filter((m) => m.id !== messageId)]
                : cache.pinned.filter((m) => m.id !== messageId),
            },
          },
        };
      });
    } catch {
      // Silently ignore — pin state stays as-is; user can retry
    }
  },
}));
