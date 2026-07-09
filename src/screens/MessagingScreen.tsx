// src/screens/MessagingScreen.tsx
//
// Integration points:
//   · useMessagesStore — fetchChannels, channels
//   · navigation → ChannelMessages with channelId + channelName
//   · colors.ts — channel type color treatment

import React, { useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useMessagesStore } from "../store/useMessagesStore";
import { colors } from "../theme/colors";
import type { Channel, ChannelType } from "../types";

const CHANNEL_ICON: Record<ChannelType, string> = {
  GENERAL: "#",
  COMMITTEE: "⬡",
  OFFICERS: "🔒",
  DM: "◉",
};

const CHANNEL_TYPE_ORDER: ChannelType[] = ["GENERAL", "OFFICERS", "COMMITTEE", "DM"];

export default function MessagingScreen() {
  const navigation = useNavigation<any>();
  const { channels, loading, error, fetchChannels } = useMessagesStore();

  useFocusEffect(useCallback(() => { fetchChannels(); }, [fetchChannels]));

  const grouped: Partial<Record<ChannelType, Channel[]>> = {};
  for (const type of CHANNEL_TYPE_ORDER) {
    const ch = channels.filter((c) => c.type === type);
    if (ch.length) grouped[type] = ch;
  }

  if (loading && !channels.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={CHANNEL_TYPE_ORDER.filter((t) => grouped[t]?.length)}
      keyExtractor={(t) => t}
      ListHeaderComponent={error && !channels.length ? <Text style={styles.errorBanner}>{error}</Text> : null}
      renderItem={({ item: type }) => (
        <View key={type}>
          <Text style={styles.groupHeader}>
            {type === "GENERAL" ? "Announcements" :
             type === "OFFICERS" ? "Officers" :
             type === "COMMITTEE" ? "Committees" : "Direct Messages"}
          </Text>
          {grouped[type]!.map((ch) => (
            <ChannelRow
              key={ch.id}
              channel={ch}
              onPress={() =>
                navigation.navigate("ChannelMessages", {
                  channelId: ch.id,
                  channelName: ch.name,
                })
              }
            />
          ))}
        </View>
      )}
    />
  );
}

function ChannelRow({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.avatarBox}>
        <Text style={styles.avatarIcon}>{CHANNEL_ICON[channel.type]}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.channelName}>{channel.name}</Text>
          {channel.lastMessage && (
            <Text style={styles.lastTime}>{formatRelative(channel.lastMessage.createdAt)}</Text>
          )}
        </View>
        {channel.lastMessage ? (
          <Text style={styles.preview} numberOfLines={1}>
            <Text style={styles.previewSender}>{channel.lastMessage.senderName.split(" ")[0]}: </Text>
            {channel.lastMessage.content}
          </Text>
        ) : (
          <Text style={styles.noMessages}>No messages yet</Text>
        )}
      </View>
      {!channel.canPost && (
        <Text style={styles.readOnly}>view only</Text>
      )}
    </Pressable>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  groupHeader: {
    fontSize: 12, fontWeight: "700", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatarBox: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    marginRight: 12,
  },
  avatarIcon: { fontSize: 20, color: colors.primaryText },
  rowBody: { flex: 1 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  channelName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  lastTime: { fontSize: 12, color: colors.textMuted },
  preview: { fontSize: 13, color: colors.textSecondary },
  previewSender: { fontWeight: "600", color: colors.textSecondary },
  noMessages: { fontSize: 13, color: colors.textMuted, fontStyle: "italic" },
  errorBanner: { color: colors.danger, fontSize: 13, textAlign: "center", padding: 16 },
  readOnly: { fontSize: 11, color: colors.textMuted, marginLeft: 8 },
});
