// mobile/screens/ChannelMessagesScreen.tsx
//
// Integration points:
//   · useMessagesStore — fetchMessages, loadMoreMessages, sendMessage, togglePin
//   · route params: channelId, channelName (from AppStackParamList)
//   · useAuthStore — current user ID for bubble alignment and long-press guard
//   · usePermissions — isOfficerOrAbove for pin access
//   · KeyboardAvoidingView for compose bar

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, ScrollView
} from "react-native";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import { useMessagesStore } from "../store/useMessagesStore";
import { useAuthStore } from "../store/useAuthStore";
import { usePermissions } from "../hooks/usePermissions";
import { colors } from "../theme/colors";
import type { Message, Channel } from "../types";

export default function ChannelMessagesScreen() {
  const route = useRoute<any>();
  const { channelId, channelName } = route.params as { channelId: string; channelName: string };

  const {
    channelData,
    channels,
    fetchMessages,
    loadMoreMessages,
    sendMessage,
    togglePin,
  } = useMessagesStore();
  const currentUser = useAuthStore((s) => s.user);
  const { isOfficerOrAbove } = usePermissions();

  const [composing, setComposing] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const cache = channelData[channelId];
  const messages = cache?.messages ?? [];
  const pinned = cache?.pinned ?? [];

  useFocusEffect(
    useCallback(() => {
      fetchMessages(channelId);
    }, [channelId, fetchMessages])
  );

  // Find current channel's canPost from the channels list
  const channel = channels.find((c) => c.id === channelId);
  const canPost = channel?.canPost ?? true;

  const handleSend = async () => {
    const text = composing.trim();
    if (!text || sending) return;
    setComposing("");
    setSending(true);
    try {
      await sendMessage(channelId, text);
    } finally {
      setSending(false);
    }
  };

  const handleLongPress = (msg: Message) => {
    if (!isOfficerOrAbove) return;
    Alert.alert(
      msg.pinned ? "Unpin message?" : "Pin message?",
      msg.pinned
        ? "Remove this message from the pinned section."
        : "Pin to the top of this channel.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: msg.pinned ? "Unpin" : "Pin",
          onPress: () => togglePin(channelId, msg.id, !msg.pinned),
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={88}
    >
      {/* Pinned messages sticky banner */}
      {pinned.length > 0 && (
        <View style={styles.pinnedBanner}>
          <Text style={styles.pinnedLabel}>📌 {pinned[0].content.slice(0, 60)}{pinned[0].content.length > 60 ? "…" : ""}</Text>
        </View>
      )}

      {/* Messages list (newest at bottom via inverted) */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        inverted
        contentContainerStyle={styles.messageList}
        onEndReached={() => loadMoreMessages(channelId)}
        onEndReachedThreshold={0.2}
        ListFooterComponent={cache?.hasMore ? <ActivityIndicator color={colors.primary} /> : null}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isMine={item.sender.id === currentUser?.id}
            onLongPress={() => handleLongPress(item)}
          />
        )}
      />

      {/* Compose bar */}
      {canPost ? (
        <View style={styles.compose}>
          <TextInput
            style={styles.input}
            value={composing}
            onChangeText={setComposing}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
          />
          <Pressable
            style={[styles.sendButton, (!composing.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!composing.trim() || sending}
          >
            <Text style={styles.sendButtonText}>→</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.readOnlyBar}>
          <Text style={styles.readOnlyText}>This channel is read-only for your role.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function MessageBubble({
  message,
  isMine,
  onLongPress,
}: {
  message: Message;
  isMine: boolean;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}
    >
      {!isMine && (
        <Text style={styles.senderName}>
          {message.sender.firstName} {message.sender.lastName}
        </Text>
      )}
      <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
        {message.content}
      </Text>
      <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
        {formatTime(message.createdAt)}
        {message._pending ? "  ·  Sending…" : ""}
        {message.pinned ? "  📌" : ""}
      </Text>
    </Pressable>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pinnedBanner: {
    backgroundColor: colors.accent + "22",
    borderBottomWidth: 1,
    borderBottomColor: colors.accent + "44",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pinnedLabel: { fontSize: 13, color: colors.textSecondary },
  messageList: { padding: 12, paddingBottom: 4 },
  bubble: {
    maxWidth: "78%",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.surface,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    alignSelf: "flex-end",
    borderColor: colors.primary,
  },
  senderName: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 3 },
  bubbleText: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  bubbleTextMine: { color: colors.primaryText },
  bubbleTime: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: "right" },
  bubbleTimeMine: { color: "rgba(255,255,255,0.5)" },
  compose: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: colors.primaryText, fontSize: 18, fontWeight: "700" },
  readOnlyBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
    alignItems: "center",
  },
  readOnlyText: { fontSize: 13, color: colors.textMuted },
});
