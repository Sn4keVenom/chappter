// src/screens/admin/CommitteeBudgetsScreen.tsx
//
// Treasurer overview of every committee's budget for the current semester
// (Feature 5) — allocated / spent (reimbursed) / pending (submitted +
// approved, not yet paid out) / remaining. Tap a committee to edit its
// allocation.
//
// Integration:
//   - listCommitteeBudgets, setCommitteeBudget → api/finance.ts
//   - Navigation: AppStackParamList → CommitteeBudgets (no params)

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from "react-native";

import { colors } from "../../theme/colors";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { listCommitteeBudgets, setCommitteeBudget } from "../../api/finance";
import { formatCurrency } from "../../types";
import type { CommitteeBudget } from "../../types";

function EditBudgetModal({
  visible, budget, onClose, onSaved,
}: {
  visible: boolean;
  budget: CommitteeBudget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && budget) setAmount(String(budget.allocated));
  }, [visible, budget]);

  if (!budget) return null;

  async function handleSave() {
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed < 0) {
      Alert.alert("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await setCommitteeBudget(budget!.committeeId, parsed);
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update budget");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{budget.committeeName}</Text>
          <Text style={styles.modalSub}>Set this semester's allocated budget</Text>
          <TextInput
            style={styles.modalInput}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalSaveBtn, saving && styles.disabledBtn]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function CommitteeBudgetsScreen() {
  const { isTreasurerOrAdmin } = usePermissions();
  const [budgets, setBudgets] = useState<CommitteeBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CommitteeBudget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBudgets(await listCommitteeBudgets());
    } catch {
      /* keep previous list */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isTreasurerOrAdmin) {
    return <RequireAccess message="Only the Treasurer or Super Admin can view committee budgets." />;
  }

  if (loading && !budgets.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={budgets}
        keyExtractor={(b) => b.committeeId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No committees found.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setEditing(item)}>
            <View style={styles.cardHeader}>
              <Text style={styles.committeeName}>{item.committeeName}</Text>
              <Text style={styles.editHint}>Edit →</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatCurrency(item.allocated)}</Text>
                <Text style={styles.statLabel}>Allocated</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.success }]}>{formatCurrency(item.spent)}</Text>
                <Text style={styles.statLabel}>Spent</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.warning }]}>{formatCurrency(item.pending)}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, item.remaining < 0 && { color: colors.danger }]}>
                  {formatCurrency(item.remaining)}
                </Text>
                <Text style={styles.statLabel}>Remaining</Text>
              </View>
            </View>
          </Pressable>
        )}
      />

      <EditBudgetModal visible={!!editing} budget={editing} onClose={() => setEditing(null)} onSaved={load} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  committeeName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  editHint: { fontSize: 12, color: colors.accent, fontWeight: "600" },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "flex-start" },
  statValue: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  modalSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 16 },
  modalInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, fontSize: 16 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: colors.border },
  modalCancelText: { color: colors.textPrimary, fontWeight: "600" },
  modalSaveBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: colors.primary },
  modalSaveText: { color: "#FFF", fontWeight: "700" },
  disabledBtn: { opacity: 0.5 },
});
