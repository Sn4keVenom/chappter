// src/screens/admin/JoinRequestsScreen.tsx
//
// Approve/deny queue for "Request to Join" (spec §3/§11 —
// chapters.manageInvites). Approving creates the ChapterMembership
// server-side (see backend/routes/chapters.routes.ts PATCH
// /chapters/join-requests/:id) — nothing else to do here but reflect the result.

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, FlatList, Alert } from "react-native";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../store/useAuthStore";
import RequireAccess from "../../components/RequireAccess";
import { getJoinRequests, reviewJoinRequest } from "../../api/chapters";
import type { ChapterJoinRequest } from "../../types";

export default function JoinRequestsScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const { can } = usePermissions();
  const chapterId = useAuthStore((s) => s.user?.chapterId);
  const [requests, setRequests] = useState<ChapterJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async ({ silent }: { silent: boolean } = { silent: false }) => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      setRequests(await getJoinRequests(chapterId, "PENDING"));
    } catch {
      /* handled by empty state */
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useFocusRefresh(load);

  if (!can("chapters.manageInvites")) {
    return <RequireAccess />;
  }

  async function handleReview(request: ChapterJoinRequest, approve: boolean) {
    setReviewingId(request.id);
    try {
      await reviewJoinRequest(request.id, approve);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not review this request");
    } finally {
      setReviewingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={requests}
      keyExtractor={(r) => r.id}
      ListEmptyComponent={<Text style={styles.emptyText}>No pending requests.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>
            {item.user ? `${item.user.firstName} ${item.user.lastName}` : "Unknown"}
          </Text>
          {item.user?.email && <Text style={styles.meta}>{item.user.email}</Text>}
          {item.message && <Text style={styles.message}>"{item.message}"</Text>}
          <Text style={styles.meta}>Requested {new Date(item.createdAt).toLocaleDateString()}</Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => handleReview(item, true)}
              disabled={reviewingId === item.id}
            >
              {reviewingId === item.id ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.approveBtnText}>Approve</Text>}
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.denyBtn]}
              onPress={() => handleReview(item, false)}
              disabled={reviewingId === item.id}
            >
              <Text style={styles.denyBtnText}>Deny</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 40 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 30 },

  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  message: { fontSize: 13, color: colors.textSecondary, fontStyle: "italic", marginTop: 6 },

  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  approveBtn: { backgroundColor: colors.success },
  approveBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },
  denyBtn: { borderWidth: 1, borderColor: colors.danger },
  denyBtnText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
}));
