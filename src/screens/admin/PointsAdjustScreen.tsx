// src/screens/admin/PointsAdjustScreen.tsx
//
// Officer+ form for a one-off bonus, penalty, or manual point correction.
// Reached from MemberProfileScreen's "Adjust Points" button (Exec+ only).
//
// Integration:
//   - adjustPoints → api/users.ts
//   - getMyDues → api/dues.ts, used only to read the current semesterId
//     (there's no dedicated "current semester" endpoint on the frontend —
//     every DuesRecord already carries semesterId, so this reuses that
//     rather than adding a new API surface just for this screen)
//   - Navigation: AppStackParamList → PointsAdjust { userId, userName }

import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { adjustPoints } from "../../api/users";
import { getMyDues } from "../../api/dues";
import type { AppStackParamList } from "../../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "PointsAdjust">;

type AdjustType = "BONUS" | "PENALTY" | "MANUAL_ADJUSTMENT";

const TYPES: { value: AdjustType; label: string; hint: string }[] = [
  { value: "BONUS", label: "Bonus", hint: "Positive — recognize extra effort" },
  { value: "PENALTY", label: "Penalty", hint: "Negative — missed obligation" },
  { value: "MANUAL_ADJUSTMENT", label: "Correction", hint: "Fix a scanner or data error" },
];

export default function PointsAdjustScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { userId, userName } = route.params;
  const { can } = usePermissions();

  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [type, setType] = useState<AdjustType>("BONUS");
  const [amount, setAmount] = useState("5");
  const [reason, setReason] = useState("");
  const [loadingSemester, setLoadingSemester] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyDues()
      .then((records) => setSemesterId(records[0]?.semesterId ?? null))
      .finally(() => setLoadingSemester(false));
  }, []);

  const handleSubmit = async () => {
    const parsed = Number(amount);
    if (!parsed || Number.isNaN(parsed)) {
      Alert.alert("Amount required", "Enter a non-zero point amount.");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("Reason required", "Explain why you're adjusting this member's points.");
      return;
    }
    if (!semesterId) {
      Alert.alert("No active semester", "Could not determine the current semester.");
      return;
    }

    const signedAmount = type === "PENALTY" ? -Math.abs(parsed) : Math.abs(parsed);

    setSaving(true);
    try {
      await adjustPoints({ userId, semesterId, amount: signedAmount, type, reason: reason.trim() });
      Alert.alert("Points adjusted", `${userName}: ${signedAmount > 0 ? "+" : ""}${signedAmount} points recorded.`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not adjust points.");
    } finally {
      setSaving(false);
    }
  };

  if (!can("points.award") && !can("points.deduct")) {
    return <RequireAccess message="Only Exec+ can adjust member points." />;
  }

  if (loadingSemester) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.memberName}>{userName}</Text>

      <Text style={styles.label}>Type</Text>
      <View style={styles.chipRow}>
        {TYPES.map((t) => (
          <Pressable
            key={t.value}
            style={[styles.chip, type === t.value && styles.chipSelected]}
            onPress={() => setType(t.value)}
          >
            <Text style={[styles.chipText, type === t.value && styles.chipTextSelected]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>{TYPES.find((t) => t.value === type)?.hint}</Text>

      <Text style={styles.label}>Points {type === "PENALTY" ? "(will be subtracted)" : ""}</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
        keyboardType="numeric"
        maxLength={4}
        placeholder="5"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Reason *</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={reason}
        onChangeText={setReason}
        placeholder="Why is this adjustment being made?"
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={3}
        maxLength={500}
      />

      <Pressable style={[styles.submitBtn, saving && styles.submitDisabled]} onPress={handleSubmit} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.submitText}>Save Adjustment</Text>}
      </Pressable>
    </View>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background, padding: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  memberName: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, marginBottom: 20, textAlign: "center" },
  label: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  chipTextSelected: { color: colors.primaryText },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  input: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  multiline: { height: 90, textAlignVertical: "top", paddingTop: 12 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 32 },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
}));
