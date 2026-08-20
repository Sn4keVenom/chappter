// src/screens/admin/FeedbackListScreen.tsx
//
// Review queue for member-submitted feedback/bug reports (spec §9) —
// requires feedback.view to see the list, feedback.manage to update status.
// Same filter-chip + tap-to-review pattern as admin/ExpensesScreen.tsx.
//
// Integration:
//   - listFeedback, updateFeedbackStatus → api/feedback.ts
//   - usePermissions: can("feedback.manage") gates status changes
//   - Navigation: AppStackParamList → FeedbackList (no params)

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert } from "react-native";
import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { badgeBackground, feedbackStatusColor } from "../../theme/semantic";
import { usePermissions } from "../../hooks/usePermissions";
import { listFeedback, updateFeedbackStatus } from "../../api/feedback";
import type { FeedbackReport, FeedbackStatus, FeedbackType } from "../../types";

const TYPE_ICON: Record<FeedbackType, string> = { BUG: "🐛", FEATURE_REQUEST: "💡", GENERAL: "💬" };
const STATUSES: FeedbackStatus[] = ["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"];

export default function FeedbackListScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const { can } = usePermissions();
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | null>(null);
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await listFeedback(statusFilter ? { status: statusFilter } : {}));
    } catch {
      /* keep previous list */
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  function handlePress(report: FeedbackReport) {
    if (!can("feedback.manage")) {
      Alert.alert(report.message, `${report.type} · ${report.status}`);
      return;
    }
    Alert.alert(
      report.message,
      `${report.submittedBy ? `${report.submittedBy.firstName} ${report.submittedBy.lastName} · ` : ""}v${report.appVersion} · ${report.platform}`,
      [
        ...STATUSES.filter((s) => s !== report.status).map((s) => ({
          text: `Mark ${s}`,
          onPress: async () => {
            try { await updateFeedbackStatus(report.id, s); await load(); }
            catch (e: any) { Alert.alert("Error", e?.message ?? "Could not update status"); }
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.filterRow}>
        <Pressable style={[styles.chip, !statusFilter && styles.chipSelected]} onPress={() => setStatusFilter(null)}>
          <Text style={[styles.chipText, !statusFilter && styles.chipTextSelected]}>All</Text>
        </Pressable>
        {STATUSES.map((s) => (
          <Pressable key={s} style={[styles.chip, statusFilter === s && styles.chipSelected]} onPress={() => setStatusFilter(s)}>
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextSelected]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {loading && !reports.length ? (
        <View style={styles.centered}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No feedback matches this filter.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => handlePress(item)}>
              <Text style={styles.rowIcon}>{TYPE_ICON[item.type]}</Text>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.rowMeta}>
                  {item.submittedBy ? `${item.submittedBy.firstName} ${item.submittedBy.lastName} · ` : ""}
                  {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: badgeBackground(feedbackStatusColor(item.status)) }]}>
                <Text style={[styles.statusBadgeText, { color: feedbackStatusColor(item.status) }]}>{item.status}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16, paddingBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  chipTextSelected: { color: colors.primaryText },
  list: { padding: 16, paddingTop: 4, gap: 8, paddingBottom: 40 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  rowIcon: { fontSize: 20 },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
}));
