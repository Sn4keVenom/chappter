// src/screens/admin/AuditLogScreen.tsx
//
// Read-only view of the AuditLog table (spec/hardening item §3 — "basic
// audit logging infrastructure"). Every privileged mutation in the backend
// already writes a row here (writeAuditLog in rbac.ts); this is the first
// place any of them are actually surfaced. Super Admin only, matching the
// backend route's gate.
//
// Integration:
//   · api/auditlog.ts getAuditLog → GET /audit-log
//   · usePermissions.isSuperAdmin gates this screen (self-gates with
//     RequireAccess, same as every other admin screen reachable via
//     navigation.navigate())

import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../../theme/colors";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { getAuditLog } from "../../api/auditlog";
import type { AuditLogEntry } from "../../types";

function actionLabel(action: string): string {
  return action
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

export default function AuditLogScreen() {
  const { isSuperAdmin } = usePermissions();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAuditLog({ page: 1, limit: LIMIT });
      setEntries(result.entries);
      setTotal(result.total);
      setPage(1);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load the audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function loadMore() {
    if (loadingMore || entries.length >= total) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getAuditLog({ page: nextPage, limit: LIMIT });
      setEntries((prev) => [...prev, ...result.entries]);
      setPage(nextPage);
    } catch {
      /* leave the list as-is — user can pull to refresh */
    } finally {
      setLoadingMore(false);
    }
  }

  if (!isSuperAdmin) {
    return <RequireAccess message="Only the Super Admin can view the audit log." />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={entries}
      keyExtractor={(e) => e.id}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={<Text style={styles.emptyText}>No privileged actions recorded yet.</Text>}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : null}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.action}>{actionLabel(item.action)}</Text>
            <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
          <Text style={styles.meta}>
            {item.actor.firstName} {item.actor.lastName} · {item.entityType} {item.entityId.slice(0, 8)}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 },
  errorText: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginBottom: 16 },
  retryBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText: { color: colors.primaryText, fontWeight: "700" },

  list: { padding: 16, paddingBottom: 40 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 30 },

  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  action: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  time: { fontSize: 11, color: colors.textMuted },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
});
