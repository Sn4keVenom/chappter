// mobile/screens/LeaderboardScreen.tsx
//
// Integration points:
//   · usePointsStore — fetchLeaderboard, leaderboard, leaderboardSemesterLabel
//   · useFocusEffect to refresh when tab is navigated to
//   · colors.accent for top-3 gold/silver/bronze treatment
//   · useAuthStore to highlight current user row

import React, { useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { usePointsStore } from "../store/usePointsStore";
import { colors } from "../theme/colors";
import type { LeaderboardEntry } from "../types";

const RANK_COLORS = ["#C8A24A", "#A8A8A8", "#A0634C"] as const; // gold, silver, bronze

export default function LeaderboardScreen() {
  const navigation = useNavigation<any>();
  const { leaderboard, leaderboardSemesterLabel, leaderboardLoading, fetchLeaderboard } =
    usePointsStore();

  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [fetchLeaderboard])
  );

  if (leaderboardLoading && !leaderboard.length) {
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
      data={leaderboard}
      keyExtractor={(item) => item.userId}
      ListHeaderComponent={
        leaderboardSemesterLabel ? (
          <Text style={styles.semesterLabel}>{leaderboardSemesterLabel}</Text>
        ) : null
      }
      renderItem={({ item }) => (
        <LeaderboardRow
          entry={item}
          onPress={() => navigation.navigate("MemberProfile", { userId: item.userId })}
        />
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No points data yet this semester.</Text>
      }
    />
  );
}

function LeaderboardRow({
  entry,
  onPress,
}: {
  entry: LeaderboardEntry;
  onPress: () => void;
}) {
  const isTop3 = entry.rank <= 3;
  const rankColor = isTop3 ? RANK_COLORS[entry.rank - 1] : colors.textMuted;

  return (
    <Pressable
      style={[styles.row, entry.isMe && styles.rowSelf]}
      onPress={onPress}
    >
      {/* Rank */}
      <View style={styles.rankContainer}>
        {isTop3 ? (
          <View style={[styles.rankBadge, { backgroundColor: rankColor }]}>
            <Text style={styles.rankBadgeText}>{entry.rank}</Text>
          </View>
        ) : (
          <Text style={styles.rankNumber}>{entry.rank}</Text>
        )}
      </View>

      {/* Avatar initial */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {entry.firstName.charAt(0)}{entry.lastName.charAt(0)}
        </Text>
      </View>

      {/* Name */}
      <View style={styles.nameBlock}>
        <Text style={styles.name}>
          {entry.firstName} {entry.lastName}
          {entry.isMe ? " (you)" : ""}
        </Text>
      </View>

      {/* Points */}
      <Text style={[styles.points, isTop3 && { color: rankColor }]}>
        {entry.total}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 8, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  semesterLabel: {
    fontSize: 13, fontWeight: "700", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5,
    marginBottom: 12, textAlign: "center",
  },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: "center", marginTop: 40 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  rowSelf: {
    borderColor: colors.primary, borderWidth: 2,
  },
  rankContainer: { width: 36, alignItems: "center" },
  rankBadge: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
  },
  rankBadgeText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  rankNumber: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  nameBlock: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  points: { fontSize: 18, fontWeight: "800", color: colors.primary },
});
