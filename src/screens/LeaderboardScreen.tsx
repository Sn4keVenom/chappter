// src/screens/LeaderboardScreen.tsx
//
// Points tab. Individual/Team segmented toggle:
//   Individual — ranked members with a points breakdown (attendance count,
//     attendance points, bonus, penalty) so it's clear points come
//     primarily from event participation (Feature 1).
//   Team — ranked teams (Feature 2). Teams are gamification-only groupings,
//     NOT committees and have no leader; a team's points are always the sum
//     of its current members' individual totals.
//
// Integration points:
//   · usePointsStore — fetchLeaderboard, leaderboard, leaderboardSemesterLabel
//   · api/teams.ts — getTeamLeaderboard (no dedicated store; local state,
//     same pattern as AdminPanelScreen's stats)
//   · useFocusEffect to refresh when tab is navigated to
//   · colors.accent for top-3 gold/silver/bronze treatment

import React, { useCallback, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { usePointsStore } from "../store/usePointsStore";
import { getTeamLeaderboard } from "../api/teams";
import { colors } from "../theme/colors";
import type { LeaderboardEntry, TeamLeaderboardEntry } from "../types";

const RANK_COLORS = ["#C8A24A", "#A8A8A8", "#A0634C"] as const; // gold, silver, bronze

type Tab = "individual" | "team";

export default function LeaderboardScreen() {
  const navigation = useNavigation<any>();
  const { leaderboard, leaderboardSemesterLabel, leaderboardLoading, fetchLeaderboard } =
    usePointsStore();

  const [tab, setTab] = useState<Tab>("individual");
  const [teams, setTeams] = useState<TeamLeaderboardEntry[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);

  const loadTeams = useCallback(async () => {
    setTeamsLoading(true);
    try {
      const result = await getTeamLeaderboard();
      setTeams(result.leaderboard);
    } catch {
      /* keep previous list */
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
      loadTeams();
    }, [fetchLeaderboard, loadTeams])
  );

  const loading = tab === "individual" ? leaderboardLoading && !leaderboard.length : teamsLoading && !teams.length;

  return (
    <View style={styles.screen}>
      <View style={styles.tabRow}>
        {(["individual", "team"] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "individual" ? "Individual" : "Teams"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : tab === "individual" ? (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
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
          ListEmptyComponent={<Text style={styles.empty}>No points data yet this semester.</Text>}
        />
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={teams}
          keyExtractor={(item) => item.teamId}
          renderItem={({ item }) => (
            <TeamRow entry={item} onPress={() => navigation.navigate("TeamDetail", { teamId: item.teamId })} />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No teams set up yet.</Text>}
        />
      )}
    </View>
  );
}

function pointsBreakdownText(entry: LeaderboardEntry): string {
  const parts: string[] = [`${entry.attendanceCount} event${entry.attendanceCount === 1 ? "" : "s"}`];
  if (entry.bonusPoints > 0) parts.push(`+${entry.bonusPoints} bonus`);
  if (entry.penaltyPoints < 0) parts.push(`${entry.penaltyPoints} penalty`);
  return parts.join(" · ");
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

      {/* Name + breakdown */}
      <View style={styles.nameBlock}>
        <Text style={styles.name}>
          {entry.firstName} {entry.lastName}
          {entry.isMe ? " (you)" : ""}
        </Text>
        <Text style={styles.breakdown}>{pointsBreakdownText(entry)}</Text>
      </View>

      {/* Points */}
      <Text style={[styles.points, isTop3 && { color: rankColor }]}>
        {entry.total}
      </Text>
    </Pressable>
  );
}

function TeamRow({ entry, onPress }: { entry: TeamLeaderboardEntry; onPress: () => void }) {
  const isTop3 = entry.rank <= 3;
  const rankColor = isTop3 ? RANK_COLORS[entry.rank - 1] : colors.textMuted;

  return (
    <Pressable style={[styles.row, entry.isMyTeam && styles.rowSelf]} onPress={onPress}>
      <View style={styles.rankContainer}>
        {isTop3 ? (
          <View style={[styles.rankBadge, { backgroundColor: rankColor }]}>
            <Text style={styles.rankBadgeText}>{entry.rank}</Text>
          </View>
        ) : (
          <Text style={styles.rankNumber}>{entry.rank}</Text>
        )}
      </View>

      <View style={[styles.teamSwatch, { backgroundColor: entry.color ?? colors.textMuted }]} />

      <View style={styles.nameBlock}>
        <Text style={styles.name}>
          {entry.teamName}
          {entry.isMyTeam ? " (your team)" : ""}
        </Text>
        <Text style={styles.breakdown}>{entry.memberCount} member{entry.memberCount === 1 ? "" : "s"}</Text>
      </View>

      <Text style={[styles.points, isTop3 && { color: rankColor }]}>{entry.totalPoints}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabRow: {
    flexDirection: "row", margin: 16, marginBottom: 0, borderRadius: 10, overflow: "hidden",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  tabTextActive: { color: colors.primaryText },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 8, paddingBottom: 48 },
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
  teamSwatch: { width: 14, height: 40, borderRadius: 5 },
  nameBlock: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  breakdown: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  points: { fontSize: 18, fontWeight: "800", color: colors.primary },
});
