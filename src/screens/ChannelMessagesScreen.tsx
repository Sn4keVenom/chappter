// src/screens/ChannelMessagesScreen.tsx
//
// Integration points:
//   · useMessagesStore — fetchMessages, loadMoreMessages, sendMessage, togglePin
//   · route params: channelId, channelName (from AppStackParamList)
//   · useAuthStore — current user ID for bubble alignment and long-press guard
//   · usePermissions — isOfficerOrAbove for pin access
//
// ── Keyboard handling ─────────────────────────────────────────────────────
// The composer used to sit under the keyboard on some devices because the
// KeyboardAvoidingView offset was the literal constant 88 — a guess at the
// header height that's only correct for a standard header on a notched
// phone. It is wrong on an iPhone SE (no notch, shorter header), wrong in
// landscape, and wrong whenever the header height changes, and being wrong
// by even a few points either hides the send button or leaves a visible gap
// under the composer.
//
// The offset now comes from useHeaderHeight(), which reports the real
// measured height of the header this screen is actually rendered under, so
// the composer lands flush above the keyboard on every device.
//
// The bar's bottom inset is applied to the composer itself rather than the
// container, so it clears the home indicator when the keyboard is closed and
// collapses to nothing when the keyboard is up (where the inset would
// otherwise become dead space between the composer and the keyboard).

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, FlatList, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, ScrollView, Keyboard
} from "react-native";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMessagesStore } from "../store/useMessagesStore";
import { useAuthStore } from "../store/useAuthStore";
import { usePermissions } from "../hooks/usePermissions";
import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";
import type { Message, Channel } from "../types";

export default function ChannelMessagesScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const route = useRoute<any>();
  const { channelId, channelName } = route.params as { channelId: string; channelName: string };

  const {
    channelData,
    channels,
    fetchChannels,
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

  // Measured, not guessed — see the keyboard note in this file's header.
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Only pad for the home indicator when the keyboard is down. With the
  // keyboard up, KeyboardAvoidingView has already lifted the bar to the
  // keyboard's top edge and this inset would just be a dead gap.
  const composerBottomInset = keyboardVisible ? 0 : insets.bottom;

  const cache = channelData[channelId];
  const messages = cache?.messages ?? [];
  const pinned = cache?.pinned ?? [];

  useFocusEffect(
    useCallback(() => {
      fetchMessages(channelId);
      // This screen is reachable directly (e.g. from CommitteeDetailScreen)
      // without ever visiting the Messaging tab, which is what normally
      // populates `channels` — without this, `channel` below stays
      // undefined and canPost would incorrectly reflect that.
      if (channels.length === 0) fetchChannels();
    }, [channelId, fetchMessages, channels.length, fetchChannels])
  );

  // Find current channel's canPost from the channels list. Defaults to
  // false (fail-closed) rather than true when the channel isn't found —
  // showing a compose bar for a channel we don't actually know the
  // permissions for would let a member try to post into e.g. a read-only
  // channel, only to have it silently fail server-side.
  const channel = channels.find((c) => c.id === channelId);
  const canPost = channel?.canPost ?? false;

  const handleSend = async () => {
    const text = composing.trim();
    if (!text || sending) return;
    setComposing("");
    setSending(true);
    try {
      await sendMessage(channelId, text);
    } catch (err: any) {
      setComposing(text); // don't lose what they typed
      Alert.alert("Message not sent", err?.message ?? "Couldn't send your message. Try again.");
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
      keyboardVerticalOffset={headerHeight}
    >
      {/* Pinned messages sticky banner */}
      {pinned.length > 0 && (
        <View style={styles.pinnedBanner}>
          <Text style={styles.pinnedLabel}>📌 {pinned[0].content.slice(0, 60)}{pinned[0].content.length > 60 ? "…" : ""}</Text>
        </View>
      )}

      {/* Messages list (newest at bottom via inverted). `inverted` is what
          keeps the most recent messages pinned just above the composer as the
          keyboard opens and the list shrinks — the bottom of the list is its
          scroll origin, so nothing has to be scrolled back into view. */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        inverted
        contentContainerStyle={styles.messageList}
        onEndReached={() => loadMoreMessages(channelId)}
        onEndReachedThreshold={0.2}
        // Let a drag on the transcript dismiss the keyboard, and keep taps on
        // message bubbles working on the first tap while it's open.
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
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
        <View style={[styles.compose, { paddingBottom: 10 + composerBottomInset }]}>
          <TextInput
            style={styles.input}
            value={composing}
            onChangeText={setComposing}
            placeholder="Message..."
            placeholderTextColor={colors.inputPlaceholder}
            keyboardAppearance={colors.keyboardAppearance}
            multiline
            maxLength={4000}
          />
          <Pressable
            style={[styles.sendButton, (!composing.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!composing.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sending ? (
              <ActivityIndicator color={colors.primaryText} size="small" />
            ) : (
              <Text style={styles.sendButtonText}>→</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={[styles.readOnlyBar, { paddingBottom: 14 + composerBottomInset }]}>
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

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  pinnedBanner: {
    backgroundColor: colors.accentSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.accentSoftBorder,
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
  bubbleOther: {},
  senderName: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 3 },
  bubbleText: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  bubbleTextMine: { color: colors.primaryText },
  bubbleTime: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: "right" },
  bubbleTimeMine: { color: "rgba(255,255,255,0.5)" },
  compose: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    // paddingBottom is applied inline — it carries the home-indicator inset
    // only while the keyboard is down.
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    // Grows with the message up to ~5 lines, then scrolls internally, so a
    // long draft can never push the send button off screen.
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.inputBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    color: colors.inputText,
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: colors.primaryText, fontSize: 18, fontWeight: "700" },
  readOnlyBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 14,
    alignItems: "center",
  },
  readOnlyText: { fontSize: 13, color: colors.textMuted },
}));
