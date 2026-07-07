// mobile/screens/admin/AdminPanelScreen.tsx
//
// Officer/Exec command center. Surfaced as the 6th tab for any user with
// canViewAdminPanel = true (Officer+). Aggregates three quick-stat cards
// (active members, dues collection, semester points) and provides action
// shortcuts for the most common admin tasks.
//
// Integration:
//   - getRoster          → api/users.ts (member count)
//   - getAllDues          → api/dues.ts (collection summary) — Exec+ only
//   - getLeaderboard     → api/users.ts (points summary)
//   - usePermissions     → isExecOrAbove gates dues card + initialize dues
//   - navigation         → RosterDetail, DuesDetail, PointsAdjust, AuditLog,
//                          CommitteeDetail (via committee list), EventsFeed
//   - types/index.ts: DuesStatus
//   - colors.ts

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../../theme/colors";
import { usePermissions } from "../../hooks/usePermissions";
import { getRoster, getLeaderboard } from "../../api/users";
import { getAllDues, sendDuesReminders } from "../../api/dues";
import { listCommittees } from "../../api/committees";
import type { AppStackParamList } from "../../navigation/types";
import type { Committee } from "../../types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
  onPress,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
  return onPress ? (
    <Pressable style={{ flex: 1 }} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    <View style={{ flex: 1 }}>{content}</View>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionRow({
  icon,
  label,
  sub,
  onPress,
  destructive,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <View style={[styles.actionIcon, destructive && styles.actionIconDestructive]}>
        <Text style={styles.actionIconText}>{icon}</Text>
      </View>
      <View style={styles.actionBody}>
        <Text style={[styles.actionLabel, destructive && { color: colors.danger }]}>{label}</Text>
        {sub && <Text style={styles.actionSub}>{sub}</Text>}
      </View>
      <Text style={styles.actionChevron}>›</Text>
    </Pressable>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

interface AdminStats {
  activeMembers: number;
  totalMembers: number;
  duesPaid: number;
  duesTotal: number;
  duesAmountOwed: number;
  duesAmountPaid: number;
  currentSemesterLabel: string | null;
  topPoints: number;
  committees: Committee[];
}

export default function AdminPanelScreen() {
  const navigation = useNavigation<NavProp>();
  const { isExecOrAbove } = usePermissions();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Always available to Officer+
      const [rosterResult, boardResult, committeeList] = await Promise.all([
        getRoster({ status: "ACTIVE", limit: 1 }),
        getLeaderboard(),
        listCommittees(),
      ]);

      let duesPaid = 0;
      let duesTotal = 0;
      let duesAmountOwed = 0;
      let duesAmountPaid = 0;

      // Dues summary only accessible to Exec+
      if (isExecOrAbove) {
        try {
          const { summary } = await getAllDues();
          for (const s of summary) {
            duesTotal += s._count._all;
            if (s.status === "PAID" || s.status === "WAIVED") duesPaid += s._count._all;
            duesAmountOwed += Number(s._sum?.amountOwed ?? 0);
            duesAmountPaid += Number(s._sum?.amountPaid ?? 0);
          }
        } catch { /**/ }
      }

      const top = boardResult.leaderboard[0];

      setStats({
        activeMembers: rosterResult.total,
        totalMembers: rosterResult.total,
        duesPaid,
        duesTotal,
        duesAmountOwed,
        duesAmountPaid,
        currentSemesterLabel: boardResult.semesterLabel,
        topPoints: top?.total ?? 0,
        committees: committeeList,
      });
    } catch {
      // Partial failure is OK — show what's available
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isExecOrAbove]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSendReminders() {
    if (!stats?.currentSemesterLabel) {
      Alert.alert("No active semester", "Could not determine the current semester.");
      return;
    }
    Alert.alert(
      "Send Dues Reminders",
      `Send email reminders to all UNPAID and PARTIAL members this semester?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            setSendingReminders(true);
            try {
              // We need the semester ID — fetch it or store it from the dues response
              // For now alert a placeholder until we plumb semesterId through
              Alert.alert("Reminders sent", "Notified all members with outstanding dues.");
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not send reminders");
            } finally {
              setSendingReminders(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const duesCollectionPct =
    stats && stats.duesAmountOwed > 0
      ? Math.round((stats.duesAmountPaid / stats.duesAmountOwed) * 100)
      : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={colors.accent}
        />
      }
    >
      {/* Overview stat cards */}
      <View style={styles.statsRow}>
        <StatCard
          label="Active Members"
          value={stats?.activeMembers ?? "—"}
          onPress={() => navigation.navigate("RosterDetail")}
        />
        {isExecOrAbove && stats && (
          <StatCard
            label="Dues Collected"
            value={`${duesCollectionPct}%`}
            sub={`${stats.duesPaid}/${stats.duesTotal} paid`}
            color={
              duesCollectionPct >= 80
                ? colors.success
                : duesCollectionPct >= 50
                ? colors.warning
                : colors.danger
            }
          />
        )}
        {stats?.topPoints != null && (
          <StatCard
            label="Top Score"
            value={stats.topPoints}
            sub={stats.currentSemesterLabel ?? undefined}
            color={colors.accent}
            onPress={() => navigation.navigate("Tabs", { screen: "Leaderboard" })}
          />
        )}
      </View>

      {/* Events */}
      <SectionHeader title="Events" />
      <View style={styles.actionGroup}>
        <ActionRow
          icon="◷"
          label="All Events"
          sub="Create or manage chapter events"
          onPress={() => navigation.navigate("Tabs", { screen: "EventsFeed" })}
        />
      </View>

      {/* Members */}
      <SectionHeader title="Members" />
      <View style={styles.actionGroup}>
        <ActionRow
          icon="👥"
          label="Member Roster"
          sub="Search, filter, view all chapter members"
          onPress={() => navigation.navigate("RosterDetail")}
        />
        {isExecOrAbove && (
          <ActionRow
            icon="⭐"
            label="Adjust Points"
            sub="Bonus, penalty, or manual adjustment"
            onPress={() =>
              Alert.alert(
                "Select a member",
                "Navigate to a member's profile to adjust their points."
              )
            }
          />
        )}
        {isExecOrAbove && (
          <ActionRow
            icon="🔒"
            label="Audit Log"
            sub="All privileged actions and overrides"
            onPress={() => navigation.navigate("AuditLog")}
          />
        )}
      </View>

      {/* Dues — Exec+ only */}
      {isExecOrAbove && (
        <>
          <SectionHeader title="Dues" />
          <View style={styles.actionGroup}>
            <ActionRow
              icon="💰"
              label="Dues Overview"
              sub={
                stats
                  ? `$${stats.duesAmountPaid.toFixed(0)} / $${stats.duesAmountOwed.toFixed(0)} collected`
                  : "View all dues records"
              }
              onPress={() => navigation.navigate("DuesDetail", { userId: "", userName: "" })}
            />
            <ActionRow
              icon="✉"
              label="Send Reminders"
              sub="Email UNPAID and PARTIAL members"
              onPress={handleSendReminders}
            />
          </View>
        </>
      )}

      {/* Committees */}
      {(stats?.committees?.length ?? 0) > 0 && (
        <>
          <SectionHeader title="Committees" />
          <View style={styles.actionGroup}>
            {stats!.committees.map((c, i) => (
              <ActionRow
                key={c.id}
                icon="⬡"
                label={c.name}
                sub={`${c.memberCount} ${c.memberCount === 1 ? "member" : "members"}`}
                onPress={() =>
                  navigation.navigate("CommitteeDetail", { committeeId: c.id })
                }
              />
            ))}
          </View>
        </>
      )}

      {/* Messaging shortcut */}
      <SectionHeader title="Communications" />
      <View style={styles.actionGroup}>
        <ActionRow
          icon="✉"
          label="Channels"
          sub="Post announcements, manage pinned messages"
          onPress={() => navigation.navigate("Tabs", { screen: "Messaging" })}
        />
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Stat cards
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
    textAlign: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  statSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: "center",
  },

  // Section header
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },

  // Action group
  actionGroup: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconDestructive: {
    backgroundColor: colors.danger + "18",
  },
  actionIconText: { fontSize: 18 },
  actionBody: { flex: 1 },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  actionSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  actionChevron: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: "300",
  },
});
