// src/screens/admin/ExpensesScreen.tsx
//
// Expense reimbursement queue (Feature 5). Treasurer sees every committee's
// expenses and can review/settle them; a committee chair reaching this
// screen sees only their own committee's expenses, read-only (the mock API
// enforces this scoping server-side too — see mocks/api.ts listExpenses).
//
// Integration:
//   - listExpenses, updateExpenseStatus → api/finance.ts
//   - usePermissions: isTreasurerOrAdmin gates the review modal
//   - Navigation: AppStackParamList → Expenses (no params)

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, FlatList, Pressable, ActivityIndicator,
  Modal, TextInput, Alert,
} from "react-native";

import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { badgeBackground, reimbursementStatusColor } from "../../theme/semantic";
import { usePermissions } from "../../hooks/usePermissions";
import { listExpenses, updateExpenseStatus } from "../../api/finance";
import { formatCurrency } from "../../types";
import type { Expense, ReimbursementStatus, PaymentMethod } from "../../types";


const STATUSES: ReimbursementStatus[] = ["SUBMITTED", "APPROVED", "REIMBURSED", "REJECTED"];

const REIMBURSEMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "VENMO", label: "Venmo" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "OTHER", label: "Other" },
];

function ReviewModal({
  visible, expense, onClose, onSaved,
}: {
  visible: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("VENMO");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<ReimbursementStatus | null>(null);

  useEffect(() => {
    if (visible) { setMethod("VENMO"); setNote(""); }
  }, [visible]);

  if (!expense) return null;

  async function setStatus(status: ReimbursementStatus) {
    setSaving(status);
    try {
      await updateExpenseStatus(expense!.id, {
        status,
        reimbursementMethod: status === "REIMBURSED" ? method : undefined,
        reimbursementNote: note.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update expense");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{expense.description}</Text>
          <Text style={styles.modalSub}>
            {expense.committeeName} · {expense.submittedBy.firstName} {expense.submittedBy.lastName} · {formatCurrency(expense.amount)}
          </Text>
          {expense.receiptLabel && <Text style={styles.modalReceipt}>📎 {expense.receiptLabel}</Text>}

          <View style={styles.methodRow}>
            {REIMBURSEMENT_METHODS.map((m) => (
              <Pressable
                key={m.value}
                style={[styles.methodChip, method === m.value && styles.methodChipSelected]}
                onPress={() => setMethod(m.value)}
              >
                <Text style={[styles.methodChipText, method === m.value && styles.methodChipTextSelected]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.noteInput}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={2}
          />

          <View style={styles.reviewActions}>
            {expense.status !== "REJECTED" && (
              <Pressable style={[styles.reviewBtn, styles.rejectBtn]} onPress={() => setStatus("REJECTED")} disabled={!!saving}>
                {saving === "REJECTED" ? <ActivityIndicator color={colors.danger} /> : <Text style={[styles.reviewBtnText, { color: colors.danger }]}>Reject</Text>}
              </Pressable>
            )}
            {expense.status === "SUBMITTED" && (
              <Pressable style={[styles.reviewBtn, styles.approveBtn]} onPress={() => setStatus("APPROVED")} disabled={!!saving}>
                {saving === "APPROVED" ? <ActivityIndicator color={colors.primaryTint} /> : <Text style={[styles.reviewBtnText, { color: colors.primaryTint }]}>Approve</Text>}
              </Pressable>
            )}
            {(expense.status === "SUBMITTED" || expense.status === "APPROVED") && (
              <Pressable style={[styles.reviewBtn, styles.reimburseBtn]} onPress={() => setStatus("REIMBURSED")} disabled={!!saving}>
                {saving === "REIMBURSED" ? <ActivityIndicator color="#fff" /> : <Text style={styles.reimburseBtnText}>Mark Reimbursed</Text>}
              </Pressable>
            )}
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function ExpensesScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const { isTreasurerOrAdmin } = usePermissions();
  const [statusFilter, setStatusFilter] = useState<ReimbursementStatus | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listExpenses(statusFilter ? { status: statusFilter } : {});
      setExpenses(result);
    } catch {
      /* keep previous list */
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  function handlePress(expense: Expense) {
    if (isTreasurerOrAdmin) {
      setSelected(expense);
      return;
    }
    Alert.alert(
      expense.description,
      `${formatCurrency(expense.amount)} · ${expense.status}${expense.reimbursementNote ? `\n\n${expense.reimbursementNote}` : ""}`
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

      {loading && !expenses.length ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No expenses match this filter.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => handlePress(item)}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.rowMeta}>
                  {item.committeeName} · {item.submittedBy.firstName} {item.submittedBy.lastName} · {new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowAmount}>{formatCurrency(item.amount)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: badgeBackground(reimbursementStatusColor(item.status)) }]}>
                  <Text style={[styles.statusBadgeText, { color: reimbursementStatusColor(item.status) }]}>{item.status}</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      <ReviewModal visible={!!selected} expense={selected} onClose={() => setSelected(null)} onSaved={load} />
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
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  rowAmount: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  modalSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  modalReceipt: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  methodChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  methodChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodChipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  methodChipTextSelected: { color: colors.primaryText },
  noteInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, fontSize: 14, marginTop: 12, minHeight: 60, textAlignVertical: "top" },
  reviewActions: { flexDirection: "row", gap: 8, marginTop: 18, flexWrap: "wrap" },
  reviewBtn: { flex: 1, minWidth: 90, borderRadius: 8, paddingVertical: 11, alignItems: "center", borderWidth: 1 },
  rejectBtn: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  approveBtn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reimburseBtn: { borderColor: colors.success, backgroundColor: colors.success },
  reviewBtnText: { fontSize: 13, fontWeight: "700" },
  reimburseBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  closeBtn: { marginTop: 12, alignItems: "center", paddingVertical: 8 },
  closeBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
}));
