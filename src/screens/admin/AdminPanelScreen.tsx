// src/screens/admin/AdminPanelScreen.tsx
//
// Officer/Exec command center. Surfaced as the 6th tab for any user with
// canViewAdminPanel = true (Officer+). Aggregates three quick-stat cards
// (active members, dues collection, semester points) and provides action
// shortcuts for the most common admin tasks.
//
// Named exec-board titles (Feature 1–5): each section below is labeled with
// the role that "owns" it in the product spec — Vice Regent (points),
// Scribe (attendance), Treasurer (dues + the new Finance section). This is
// intentionally additive, not exclusive: any Exec+ member can still see and
// use these sections (unchanged from before this feature set), the title
// holder is just called out so it's clear who's meant to drive it day to
// day. The Finance section is the one exception — it's brand new, so it's
// gated to Treasurer/SuperAdmin outright (isTreasurerOrAdmin) since there's
// no prior behavior to preserve there.
//
// Integration:
//   - getRoster          → api/users.ts (member count)
//   - getAllDues          → api/dues.ts (collection summary) — Exec+ only
//   - getLeaderboard     → api/users.ts (points summary)
//   - listCommitteeBudgets → api/finance.ts (Finance section preview) — Treasurer+ only
//   - usePermissions     → isExecOrAbove gates dues card + initialize dues;
//                          isTreasurerOrAdmin gates the Finance section
//   - navigation         → RosterDetail, DuesDetail, PointsAdjust, AuditLog,
//                          CommitteeDetail (via committee list), EventsFeed,
//                          CommitteeBudgets, Expenses
//   - types/index.ts: DuesStatus
//   - colors.ts

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { usePermissions } from "../../hooks/usePermissions";
import { useModulesStore } from "../../store/useModulesStore";
import { getRoster, getLeaderboard } from "../../api/users";
import { getAllDues, sendDuesReminders } from "../../api/dues";
import { listCommittees } from "../../api/committees";
import { listCommitteeBudgets } from "../../api/finance";
import { formatCurrency } from "../../types";
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
  currentSemesterId: string | null;
  topPoints: number;
  committees: Committee[];
  financeRemaining: number;
  financePending: number;
}

export default function AdminPanelScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<NavProp>();
  const { isExecOrAbove, isTreasurerOrAdmin, isSuperAdmin, can } = usePermissions();
  const isEventsEnabled = useModulesStore((s) => s.isEnabled("events"));
  const isDuesEnabled = useModulesStore((s) => s.isEnabled("dues"));
  const isCommitteesEnabled = useModulesStore((s) => s.isEnabled("committees"));
  const isMessagingEnabled = useModulesStore((s) => s.isEnabled("messaging"));
  const isDocumentsEnabled = useModulesStore((s) => s.isEnabled("documents"));
  const isFeedbackEnabled = useModulesStore((s) => s.isEnabled("feedback"));

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  const load = useCallback(async (isRefresh = false, silent = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);

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
      let currentSemesterId: string | null = null;

      // Dues summary only accessible to Exec+
      if (isExecOrAbove) {
        try {
          const { records, summary } = await getAllDues();
          currentSemesterId = records[0]?.semesterId ?? null;
          for (const s of summary) {
            duesTotal += s._count._all;
            if (s.status === "PAID" || s.status === "WAIVED") duesPaid += s._count._all;
            duesAmountOwed += Number(s._sum?.amountOwed ?? 0);
            duesAmountPaid += Number(s._sum?.amountPaid ?? 0);
          }
        } catch { /**/ }
      }

      let financeRemaining = 0;
      let financePending = 0;

      // Finance summary (Feature 5) — Treasurer/SuperAdmin only
      if (isTreasurerOrAdmin) {
        try {
          const budgets = await listCommitteeBudgets();
          for (const b of budgets) {
            financeRemaining += b.remaining;
            if (b.pending > 0) financePending += 1;
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
        currentSemesterId,
        topPoints: top?.total ?? 0,
        committees: committeeList,
        financeRemaining,
        financePending,
      });
    } catch {
      // Partial failure is OK — show what's available
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isExecOrAbove, isTreasurerOrAdmin]);

  useFocusRefresh(useCallback(({ silent }) => load(false, silent), [load]));

  async function handleSendReminders() {
    if (!stats?.currentSemesterId) {
      Alert.alert("No active semester", "Could not determine the current semester.");
      return;
    }
    const semesterId = stats.currentSemesterId;
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
              const result = await sendDuesReminders(semesterId);
              Alert.alert(
                "Reminders sent",
                result.sent > 0
                  ? `Notified ${result.sent} member${result.sent === 1 ? "" : "s"} with outstanding dues.`
                  : "No members currently have outstanding dues."
              );
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
      {isEventsEnabled && (
        <>
          <SectionHeader title="Events" />
          <View style={styles.actionGroup}>
            <ActionRow
              icon="◷"
              label="All Events"
              sub="Create or manage chapter events — attendance is tracked by the Scribe"
              onPress={() => navigation.navigate("Tabs", { screen: "EventsFeed" })}
            />
          </View>
        </>
      )}

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
            sub="Vice Regent oversight — find a member on the roster, then adjust from their profile"
            onPress={() => navigation.navigate("RosterDetail")}
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

      {/* Chapter Membership — chapters.manageInvites (spec §3/§11) */}
      {can("chapters.manageInvites") && (
        <>
          <SectionHeader title="Chapter Membership" />
          <View style={styles.actionGroup}>
            <ActionRow
              icon="🔗"
              label="Invite Members"
              sub="Create or revoke invite codes/links"
              onPress={() => navigation.navigate("ChapterInviteManager")}
            />
            <ActionRow
              icon="📥"
              label="Join Requests"
              sub="Review pending requests to join the chapter"
              onPress={() => navigation.navigate("JoinRequests")}
            />
          </View>
        </>
      )}

      {/* Dues — Exec+ only, Treasurer-owned */}
      {isExecOrAbove && isDuesEnabled && (
        <>
          <SectionHeader title="Dues — Treasurer" />
          <View style={styles.actionGroup}>
            <ActionRow
              icon="💰"
              label="Dues Overview"
              sub={
                stats
                  ? `$${stats.duesAmountPaid.toFixed(0)} / $${stats.duesAmountOwed.toFixed(0)} collected via Pyli`
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

      {/* Finance — Treasurer/SuperAdmin only (Feature 5, brand new — no
          prior broader access to preserve) */}
      {isTreasurerOrAdmin && isCommitteesEnabled && (
        <>
          <SectionHeader title="Finance — Treasurer" />
          <View style={styles.actionGroup}>
            <ActionRow
              icon="🏦"
              label="Committee Budgets"
              sub={stats ? `${formatCurrency(stats.financeRemaining)} remaining across all committees` : "Allocate and track committee spending"}
              onPress={() => navigation.navigate("CommitteeBudgets")}
            />
            <ActionRow
              icon="🧾"
              label="Expense Reimbursements"
              sub={
                stats && stats.financePending > 0
                  ? `${stats.financePending} committee${stats.financePending === 1 ? "" : "s"} with pending expenses`
                  : "Review submitted expenses and settle reimbursements"
              }
              onPress={() => navigation.navigate("Expenses")}
            />
          </View>
        </>
      )}

      {/* Committees */}
      {isCommitteesEnabled && (stats?.committees?.length ?? 0) > 0 && (
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
      {isMessagingEnabled && (
        <>
          <SectionHeader title="Communications" />
          <View style={styles.actionGroup}>
            <ActionRow
              icon="✉"
              label="Channels"
              sub="Post announcements, manage pinned messages"
              onPress={() => navigation.navigate("Tabs", { screen: "Messaging" })}
            />
          </View>
        </>
      )}

      {/* Documents & Feedback management — Exec+ (documents.upload/delete,
          feedback.view/manage presets), hidden entirely when their module
          is disabled */}
      {(isDocumentsEnabled || isFeedbackEnabled) && (
        <>
          <SectionHeader title="Documents & Feedback" />
          <View style={styles.actionGroup}>
            {isDocumentsEnabled && (
              <ActionRow
                icon="📄"
                label="Documents"
                sub="Chapter files, forms, and external links"
                onPress={() => navigation.navigate("Documents")}
              />
            )}
            {isFeedbackEnabled && (
              <ActionRow
                icon="💬"
                label="Feedback Submissions"
                sub="Review bug reports and feature requests"
                onPress={() => navigation.navigate("FeedbackList")}
              />
            )}
          </View>
        </>
      )}

      {/* Chapter Administration — Super Admin only (spec §4) */}
      {isSuperAdmin && (
        <>
          <SectionHeader title="Chapter Administration" />
          <View style={styles.actionGroup}>
            <ActionRow
              icon="🏛"
              label="Chapter Settings"
              sub="Chapter name, semester dates, dues & attendance defaults"
              onPress={() => navigation.navigate("ChapterSettings")}
            />
            <ActionRow
              icon="🧩"
              label="Modules"
              sub="Enable or disable entire app sections"
              onPress={() => navigation.navigate("Modules")}
            />
            <ActionRow
              icon="🔑"
              label="Permissions"
              sub="Edit what each role can do"
              onPress={() => navigation.navigate("Permissions")}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = makeStyles((colors) => ({
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
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconDestructive: {
    backgroundColor: colors.dangerSoft,
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
}));
