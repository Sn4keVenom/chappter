// src/screens/admin/ChapterInviteManagerScreen.tsx
//
// Create and revoke invite codes/links (spec §3/§11 — chapters.manageInvites).
// A "link" is just this same code embedded in a deep link
// (chapterhub://join?code=XXXX — see RootNavigator's linking config), so
// there's one list, not two.
//
// Integration:
//   · api/chapters.ts — createInvite/getInvites/revokeInvite
//   · usePermissions  — gated by can("chapters.manageInvites") in AdminPanelScreen
//   · self-gates with RequireAccess like every other admin screen reachable
//     via navigation.navigate()

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
  Share,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { colors } from "../../theme/colors";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../store/useAuthStore";
import RequireAccess from "../../components/RequireAccess";
import { createInvite, getInvites, revokeInvite } from "../../api/chapters";
import type { ChapterInvite } from "../../types";

function InviteRow({ invite, onRevoke }: { invite: ChapterInvite; onRevoke: (id: string) => void }) {
  const revoked = !!invite.revokedAt;
  const expired = !!invite.expiresAt && new Date(invite.expiresAt) < new Date();
  const exhausted = invite.maxUses != null && invite.useCount >= invite.maxUses;
  const inactive = revoked || expired || exhausted;

  const link = `chapterhub://join?code=${invite.code}`;

  return (
    <View style={[styles.card, inactive && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>{invite.code}</Text>
          <Text style={styles.meta}>
            {invite.role} · starts as {invite.status}
            {invite.maxUses != null ? ` · ${invite.useCount}/${invite.maxUses} used` : ` · ${invite.useCount} used`}
          </Text>
          {invite.expiresAt && (
            <Text style={styles.meta}>Expires {new Date(invite.expiresAt).toLocaleDateString()}</Text>
          )}
          {revoked && <Text style={styles.revokedTag}>Revoked</Text>}
          {!revoked && expired && <Text style={styles.revokedTag}>Expired</Text>}
          {!revoked && !expired && exhausted && <Text style={styles.revokedTag}>Use limit reached</Text>}
        </View>
        {!inactive && <QRCode value={link} size={64} backgroundColor={colors.surface} />}
      </View>

      {!inactive && (
        <View style={styles.cardActions}>
          <Pressable style={styles.actionBtn} onPress={() => Share.share({ message: link })}>
            <Text style={styles.actionBtnText}>Share Link</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.revokeBtn]} onPress={() => onRevoke(invite.id)}>
            <Text style={[styles.actionBtnText, styles.revokeBtnText]}>Revoke</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function ChapterInviteManagerScreen() {
  const { can } = usePermissions();
  const chapterId = useAuthStore((s) => s.user?.chapterId);
  const [invites, setInvites] = useState<ChapterInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setInvites(await getInvites(chapterId));
    } catch {
      /* handled by empty state */
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!can("chapters.manageInvites")) {
    return <RequireAccess />;
  }

  async function handleCreate() {
    if (!chapterId) return;
    setCreating(true);
    try {
      await createInvite(chapterId, { role: "MEMBER", status: "PNM" });
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't create invite", e?.message ?? "Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function handleRevoke(inviteId: string) {
    if (!chapterId) return;
    Alert.alert("Revoke this invite?", "It can no longer be redeemed once revoked.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          try {
            await revokeInvite(chapterId, inviteId);
            await load();
          } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Could not revoke invite");
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Pressable style={[styles.createButton, creating && styles.buttonDisabled]} onPress={handleCreate} disabled={creating}>
        {creating ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.createButtonText}>+ New Invite Code</Text>}
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={invites}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No invites yet — create one above.</Text>}
          renderItem={({ item }) => <InviteRow invite={item} onRevoke={handleRevoke} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 16 },
  createButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 16 },
  createButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },

  list: { paddingBottom: 40 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  cardInactive: { opacity: 0.55 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  code: { fontSize: 20, fontWeight: "800", letterSpacing: 2, color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  revokedTag: { fontSize: 11, fontWeight: "700", color: colors.danger, marginTop: 4, textTransform: "uppercase" },

  cardActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingVertical: 9, alignItems: "center" },
  actionBtnText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  revokeBtn: { borderColor: colors.danger },
  revokeBtnText: { color: colors.danger },

  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 30 },
});
