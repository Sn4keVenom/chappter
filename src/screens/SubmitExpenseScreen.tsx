// src/screens/SubmitExpenseScreen.tsx
//
// Committee chairs submit an expense against their committee's budget
// (Feature 5). Reached from CommitteeDetailScreen's "Submit Expense" button
// (chair-only). Follows the same form patterns as CreateEventScreen
// (DateTimePicker, chip-free simple fields).
//
// Receipt "upload" is a mock placeholder — tapping the button simulates
// picking a file and stores a filename label, no real image picker or
// object storage. See types/index.ts Expense.receiptLabel doc comment for
// what production would need.
//
// Integration:
//   - submitExpense → api/finance.ts
//   - getCommitteeBudget → api/finance.ts (shows remaining budget for context)
//   - Navigation: AppStackParamList → SubmitExpense { committeeId, committeeName }

import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Platform,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../theme/colors";
import { submitExpense, getCommitteeBudget } from "../api/finance";
import { formatCurrency } from "../types";
import type { CommitteeBudget } from "../types";
import type { AppStackParamList } from "../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "SubmitExpense">;

export default function SubmitExpenseScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { committeeId, committeeName } = route.params;

  const [budget, setBudget] = useState<CommitteeBudget | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [receiptLabel, setReceiptLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCommitteeBudget(committeeId).then(setBudget).catch(() => {});
  }, [committeeId]);

  const handleMockUpload = () => {
    // No real file picker — this is a demo placeholder, not a production upload flow.
    setReceiptLabel(`receipt_${Date.now()}.jpg`);
  };

  const handleSubmit = async () => {
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await submitExpense({
        committeeId,
        amount: parsedAmount,
        description: description.trim(),
        date: date.toISOString(),
        receiptLabel: receiptLabel ?? undefined,
      });
      Alert.alert("Expense submitted", "The Treasurer will review it and update the reimbursement status.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't submit expense — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) setDate(selected);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.committeeName}>{committeeName}</Text>
      {budget && (
        <View style={styles.budgetCard}>
          <Text style={styles.budgetLabel}>Remaining budget this semester</Text>
          <Text style={[styles.budgetValue, budget.remaining < 0 && { color: colors.danger }]}>
            {formatCurrency(budget.remaining)}
          </Text>
          <Text style={styles.budgetSub}>
            {formatCurrency(budget.allocated)} allocated · {formatCurrency(budget.pending)} pending review
          </Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Amount *</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Description *</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="What was this for?"
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={3}
        maxLength={300}
      />

      <Text style={styles.label}>Date</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dateButtonText}>
          {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </Text>
      </Pressable>
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onDateChange}
          maximumDate={new Date()}
        />
      )}

      <Text style={styles.label}>Receipt</Text>
      <Pressable style={styles.uploadButton} onPress={handleMockUpload}>
        <Text style={styles.uploadButtonText}>{receiptLabel ? `📎 ${receiptLabel}` : "📎 Attach receipt"}</Text>
      </Pressable>

      <Pressable
        style={[styles.submitButton, saving && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.submitText}>Submit for Reimbursement</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  committeeName: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  budgetCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  budgetLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  budgetValue: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, marginTop: 6 },
  budgetSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  error: { color: colors.danger, fontSize: 13, marginBottom: 16, textAlign: "center" },
  label: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  multiline: { height: 90, textAlignVertical: "top", paddingTop: 12 },
  dateButton: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  dateButtonText: { fontSize: 15, color: colors.textPrimary },
  uploadButton: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", paddingVertical: 14, alignItems: "center" },
  uploadButtonText: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  submitButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 32 },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
});
