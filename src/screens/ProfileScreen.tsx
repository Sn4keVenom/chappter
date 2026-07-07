// mobile/screens/ProfileScreen.tsx
//
// Profile tab. Shows the current user's personal data: points this semester,
// attendance history (last 5), dues status, and committee memberships.
//
// Integration:
//   - getMe           → api/users.ts
//   - getMyDues       → api/dues.ts (returns DuesRecord[])
//   - getMyAttendanceHistory → api/attendance.ts (returns { records, nextCursor })
//   - getLeaderboard  → api/users.ts (for current-semester rank)
//   - useAuthStore: setUser(null) on sign-out
//   - setAuthToken(null): api/client.ts
//   - @clerk/clerk-expo: useSignOut
//   - types/index.ts: User, DuesRecord, DuesStatus, AttendanceRecord, formatCurrency, fullName

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Alert, RefreshControl
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSignOut } from "@clerk/clerk-expo";

import { colors } from "../theme/colors";
import { useAuthStore } from "../store/useAuthStore";
import { getMe, getLeaderboard } from "../api/users";
import { getMyDues } from "../api/dues";
import { getMyAttendanceHistory } from "../api/attendance";
import { setAuthToken } from "../api/client";
import type { User, DuesRecord, DuesStatus, AttendanceRecord } from "../types";
import { formatCurrency, fullName } from "../types";

const DUES_COLOR: Record<DuesStatus, string> = {
  PAID: colors.success,
  PARTIAL: colors.warning,
  UNPAID: colors.danger,
  WAIVED: colors.textMuted,
};

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const userFromStore = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { signOut } = useSignOut();

  const [profile, setProfile] = useState<User | null>(null);
  const [dues, setDues] = useState<DuesRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [semesterLabel, setSemesterLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [me, duesRecords, histResult, board] = await Promise.all([
        getMe(),
        getMyDues(),
        getMyAttendanceHistory({ limit: 5 }),
        getLeaderboard(),
      ]);

      setProfile(me);
      // Show most recent semester's dues record (first in the array, sorted by createdAt desc)
      setDues(duesRecords[0] ?? null);
      setHistory(histResult.records);

      // Find self on leaderboard
      const self = board.leaderboard.find((e) => e.userId === me.id);
      setRank(self?.rank ?? null);
      setTotalPoints(self?.total ?? 0);
      setSemesterLabel(board.semesterLabel);
    } catch {
      // Non-fatal — show what we have from the store
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = () => {
    Alert.alert("Sign out", "You'll need to sign back in to access ChapterHub.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          setAuthToken(null);
          setUser(null);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const displayName = profile
    ? fullName(profile)
    : `${userFromStore?.firstName ?? ""} ${userFromStore?.lastName ?? ""}`.trim();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={colors.primary}
        />
      }
    >
      {/* Avatar + identity */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitials}>
            {(profile?.firstName ?? userFromStore?.firstName ?? "?").charAt(0)}
          </Text>
        </View>
        <Text style={styles.heroName}>{displayName}</Text>
        <Text style={styles.heroRole}>{profile?.role ?? userFromStore?.role}</Text>
        {profile?.pledgeClassLabel && (
          <Text style={styles.heroPledgeClass}>{profile.pledgeClassLabel}</Text>
        )}
        {profile?.email && (
          <Text style={styles.heroEmail}>{profile.email}</Text>
        )}
      </View>

      {/* Points card */}
      {semesterLabel && (
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate("Leaderboard")}
        >
          <Text style={styles.cardLabel}>Points — {semesterLabel}</Text>
          <View style={styles.pointsRow}>
            <Text style={styles.pointsTotal}>{totalPoints}</Text>
            {rank && (
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>#{rank}</Text>
              </View>
            )}
          </View>
        </Pressable>
      )}

      {/* Dues card */}
      {dues && (
        <View style={[styles.card, { borderLeftColor: DUES_COLOR[dues.status], borderLeftWidth: 4 }]}>
          <Text style={styles.cardLabel}>Dues — {dues.semester.label}</Text>
          <View style={styles.duesRow}>
            <Text style={[styles.duesStatus, { color: DUES_COLOR[dues.status] }]}>
              {dues.status}
            </Text>
            <Text style={styles.duesAmount}>
              {formatCurrency(dues.amountPaid)} paid of {formatCurrency(dues.amountOwed)}
            </Text>
          </View>
          {dues.dueDate && dues.status !== "PAID" && dues.status !== "WAIVED" && (
            <Text style={styles.dueDue}>
              Due {new Date(dues.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </Text>
          )}
        </View>
      )}

      {/* Committee memberships */}
      {(profile?.committeeMemberships?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Committees</Text>
          {profile!.committeeMemberships!.map((m) => (
            <Pressable
              key={m.committeeId}
              style={styles.committeeRow}
              onPress={() => navigation.navigate("CommitteeDetail", { committeeId: m.committeeId })}
            >
              <Text style={styles.committeeName}>{m.committeeName}</Text>
              <Text style={styles.committeeRole}>{m.role}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Recent attendance */}
      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent attendance</Text>
          {history.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.historyRow}
              onPress={() => navigation.navigate("EventDetail", { eventId: entry.event.id })}
            >
              <View style={styles.historyInfo}>
                <Text style={styles.historyTitle} numberOfLines={1}>
                  {entry.event.title}
                </Text>
                <Text style={styles.historyMeta}>
                  {new Date(entry.event.startTime).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  {entry.late ? " · Late" : ""}
                  {" · "}
                  {entry.method === "MANUAL" ? "Manual" : "QR"}
                </Text>
              </View>
              <Text style={[styles.historyPoints, entry.late && { color: colors.warning }]}>
                +{entry.pointsAwarded}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Sign out */}
      <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },

  // Hero
  hero: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  avatarInitials: { fontSize: 30, fontWeight: "800", color: colors.primaryText },
  heroName: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  heroRole: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  heroPledgeClass: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  heroEmail: { fontSize: 12, color: colors.textMuted, marginTop: 3 },

  // Cards
  card: {
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: {
    fontSize: 11, fontWeight: "700", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
  },

  // Points
  pointsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pointsTotal: { fontSize: 32, fontWeight: "800", color: colors.textPrimary },
  rankBadge: {
    backgroundColor: colors.accent + "22", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  rankText: { color: colors.accent, fontWeight: "700", fontSize: 16 },

  // Dues
  duesRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  duesStatus: { fontSize: 18, fontWeight: "800" },
  duesAmount: { fontSize: 13, color: colors.textSecondary },
  dueDue: { fontSize: 12, color: colors.warning, marginTop: 6 },

  // Section
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12, fontWeight: "700", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
  },

  // Committee rows
  committeeRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  committeeName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  committeeRole: { fontSize: 12, color: colors.textMuted, fontWeight: "600", textTransform: "uppercase" },

  // Attendance history
  historyRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  historyInfo: { flex: 1 },
  historyTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  historyMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  historyPoints: { fontSize: 16, fontWeight: "800", color: colors.success },

  // Sign out
  signOutBtn: {
    marginTop: 24, paddingVertical: 14, alignItems: "center",
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
  },
  signOutText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
});
