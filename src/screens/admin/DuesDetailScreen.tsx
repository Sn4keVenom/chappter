// src/screens/admin/DuesDetailScreen.tsx
//
// Exec+ dues overview: summary by status, searchable per-member list, and
// Record Payment / Waive actions. Reached from AdminPanelScreen's "Dues
// Overview" action row (currently always navigates with empty
// { userId: "", userName: "" } params — nothing in the app deep-links to a
// specific member's dues yet, so this screen's primary mode is the
// chapter-wide table; params are honored as an initial search filter if
// ever passed with a real value).
//
// Integration:
//   - getAllDues, recordPayment, waiveDues → api/dues.ts
//   - Navigation: AppStackParamList → DuesDetail { userId, userName }

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, FlatList, Pressable,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { badgeBackground, duesStatusColor } from "../../theme/semantic";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { getAllDues, recordPayment, waiveDues } from "../../api/dues";
import { formatCurrency } from "../../types";
import type { DuesRecord, DuesStatus } from "../../types";
import type { AppStackParamList } from "../../navigation/types";

type RoutePropType = RouteProp<AppStackParamList, "DuesDetail">;
type Row = DuesRecord & { user: { id: string; firstName: string; lastName: string; email: string } };


const PAYMENT_METHODS: { value: "CASH" | "VENMO" | "CHECK" | "OTHER"; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "VENMO", label: "Venmo" },
  { value: "CHECK", label: "Check" },
  { value: "OTHER", label: "Other" },
];

function PaymentModal({
  visible, row, onClose, onSaved,
}: {
  visible: boolean;
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "VENMO" | "CHECK" | "OTHER">("CASH");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setAmount(""); setMethod("CASH"); }
  }, [visible]);

  async function handleSave() {
    if (!row) return;
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) { Alert.alert("Enter a valid amount"); return; }
    setSaving(true);
    try {
      await recordPayment(row.userId, { semesterId: row.semesterId, amount: parsed, method });
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not record payment");
    } finally {
      setSaving(false);
    }
  }

  if (!row) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Record Payment</Text>
          <Text style={styles.modalSub}>{row.user.firstName} {row.user.lastName}</Text>
          <Text style={styles.modalOwed}>
            {formatCurrency(row.amountOwed - row.amountPaid)} remaining
          </Text>

          <TextInput
            style={styles.modalInput}
            placeholder="Amount"
            placeholderTextColor={colors.textMuted}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
          />

          <View style={styles.methodRow}>
            {PAYMENT_METHODS.map((m) => (
              <Pressable
                key={m.value}
                style={[styles.methodChip, method === m.value && styles.methodChipSelected]}
                onPress={() => setMethod(m.value)}
              >
                <Text style={[styles.methodChipText, method === m.value && styles.methodChipTextSelected]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalSaveBtn, saving && styles.disabledBtn]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Record</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function WaiveModal({
  visible, row, onClose, onSaved,
}: {
  visible: boolean;
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setReason(""); }, [visible]);

  async function handleSave() {
    if (!row) return;
    if (!reason.trim()) { Alert.alert("Reason required"); return; }
    setSaving(true);
    try {
      await waiveDues(row.userId, row.semesterId, reason.trim());
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not waive dues");
    } finally {
      setSaving(false);
    }
  }

  if (!row) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Waive Dues</Text>
          <Text style={styles.modalSub}>{row.user.firstName} {row.user.lastName}</Text>
          <TextInput
            style={[styles.modalInput, styles.modalMultiline]}
            placeholder="Reason (financial hardship, alumni status, etc.)"
            placeholderTextColor={colors.textMuted}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalSaveBtn, { backgroundColor: colors.danger }, saving && styles.disabledBtn]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Waive</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function DuesDetailScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const route = useRoute<RoutePropType>();
  const { can } = usePermissions();
  const [query, setQuery] = useState(route.params?.userName ?? "");
  const [records, setRecords] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{ status: string; _count: { _all: number }; _sum: { amountOwed: number; amountPaid: number } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentRow, setPaymentRow] = useState<Row | null>(null);
  const [waiveRow, setWaiveRow] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllDues({});
      setRecords(result.records);
      setSummary(result.summary);
    } catch {
      /* keep previous list */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = records.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return `${r.user.firstName} ${r.user.lastName}`.toLowerCase().includes(q) || r.user.email.toLowerCase().includes(q);
  });

  if (!can("dues.manage")) {
    return <RequireAccess message="Only Exec+ can view chapter-wide dues." />;
  }

  if (loading && !records.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.summaryRow}>
        {summary.map((s) => (
          <View key={s.status} style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: duesStatusColor(s.status as DuesStatus) }]}>{s._count._all}</Text>
            <Text style={styles.summaryLabel}>{s.status}</Text>
          </View>
        ))}
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by name…"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        clearButtonMode="while-editing"
      />

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No dues records match.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>{item.user.firstName} {item.user.lastName}</Text>
              <Text style={styles.rowMeta}>
                {formatCurrency(item.amountPaid)} / {formatCurrency(item.amountOwed)}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: badgeBackground(duesStatusColor(item.status)) }]}>
              <Text style={[styles.statusBadgeText, { color: duesStatusColor(item.status) }]}>{item.status}</Text>
            </View>
            {(item.status === "UNPAID" || item.status === "PARTIAL") && (
              <View style={styles.rowActions}>
                <Pressable style={styles.actionBtn} onPress={() => setPaymentRow(item)}>
                  <Text style={styles.actionBtnText}>Pay</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.waiveBtn]} onPress={() => setWaiveRow(item)}>
                  <Text style={[styles.actionBtnText, styles.waiveBtnText]}>Waive</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      />

      <PaymentModal visible={!!paymentRow} row={paymentRow} onClose={() => setPaymentRow(null)} onSaved={load} />
      <WaiveModal visible={!!waiveRow} row={waiveRow} onClose={() => setWaiveRow(null)} onSaved={load} />
    </View>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },

  summaryRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: "center" },
  summaryValue: { fontSize: 20, fontWeight: "800" },
  summaryLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, marginTop: 2 },

  searchInput: { marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.textPrimary },

  list: { padding: 16, paddingTop: 4, gap: 8, paddingBottom: 40 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 14 },
  row: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  rowInfo: { flex: 1, minWidth: 140 },
  rowName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: "800" },
  rowActions: { flexDirection: "row", gap: 6, width: "100%" },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center", backgroundColor: colors.primary },
  actionBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 12 },
  waiveBtn: { backgroundColor: colors.border },
  waiveBtnText: { color: colors.textSecondary },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  modalSub: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  modalOwed: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 12 },
  modalInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, fontSize: 15, marginTop: 12 },
  modalMultiline: { minHeight: 80, textAlignVertical: "top" },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  methodChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  methodChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodChipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  methodChipTextSelected: { color: colors.primaryText },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: colors.border },
  modalCancelText: { color: colors.textPrimary, fontWeight: "600" },
  modalSaveBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: colors.primary },
  modalSaveText: { color: "#FFF", fontWeight: "700" },
  disabledBtn: { opacity: 0.5 },
}));
