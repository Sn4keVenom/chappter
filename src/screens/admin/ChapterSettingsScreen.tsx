// src/screens/admin/ChapterSettingsScreen.tsx
//
// Centralized chapter configuration (spec §6) — Super Admin only
// (settings.manage). This is the primary place future chapter-wide
// customization should live: name, letters, university, semester dates,
// and defaults for dues/attendance/points that other modules read from.
//
// Integration:
//   - getChapterSettings, updateChapterSettings → api/settings.ts
//   - Navigation: AppStackParamList → ChapterSettings (no params)

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { colors } from "../../theme/colors";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { getChapterSettings, updateChapterSettings } from "../../api/settings";
import type { ChapterSettings, DuesPlan } from "../../types";

function Field({ label, value, onChangeText, keyboardType }: {
  label: string; value: string; onChangeText: (t: string) => void; keyboardType?: "numeric";
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.field}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export default function ChapterSettingsScreen() {
  const { isSuperAdmin } = usePermissions();
  const [settings, setSettings] = useState<ChapterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await getChapterSettings());
    } catch {
      Alert.alert("Error", "Could not load chapter settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function update<K extends keyof ChapterSettings>(key: K, value: ChapterSettings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await updateChapterSettings(settings);
      setSettings(saved);
      Alert.alert("Saved", "Chapter settings updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdmin) {
    return <RequireAccess message="Only the Super Admin can view or edit chapter settings." />;
  }

  if (loading || !settings) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Chapter Identity</Text>
      <Field label="Chapter Name" value={settings.chapterName} onChangeText={(t) => update("chapterName", t)} />
      <Field label="Chapter Letters" value={settings.chapterLetters} onChangeText={(t) => update("chapterLetters", t)} />
      <Field label="University" value={settings.university} onChangeText={(t) => update("university", t)} />

      <Text style={styles.sectionTitle}>Semester</Text>
      <Field label="Current Semester Label" value={settings.currentSemesterLabel} onChangeText={(t) => update("currentSemesterLabel", t)} />

      <Text style={styles.sectionTitle}>Dues Defaults</Text>
      <Field
        label="Default Dues Amount ($)"
        value={String(settings.defaultDuesAmount)}
        onChangeText={(t) => update("defaultDuesAmount", Number(t) || 0)}
        keyboardType="numeric"
      />
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>Default Plan</Text>
        <View style={styles.planRow}>
          {(["FULL", "MONTHLY"] as DuesPlan[]).map((p) => (
            <Pressable
              key={p}
              style={[styles.planChip, settings.defaultDuesPlan === p && styles.planChipSelected]}
              onPress={() => update("defaultDuesPlan", p)}
            >
              <Text style={[styles.planChipText, settings.defaultDuesPlan === p && styles.planChipTextSelected]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Attendance & Points</Text>
      <Field
        label="Late Threshold (minutes)"
        value={String(settings.attendanceLateThresholdMinutes)}
        onChangeText={(t) => update("attendanceLateThresholdMinutes", Number(t) || 0)}
        keyboardType="numeric"
      />
      <Field
        label="Default Event Point Value"
        value={String(settings.defaultEventPointValue)}
        onChangeText={(t) => update("defaultEventPointValue", Number(t) || 0)}
        keyboardType="numeric"
      />

      <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Settings</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 6 },
  field: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, fontSize: 15 },
  planRow: { flexDirection: "row", gap: 10 },
  planChip: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  planChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  planChipText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  planChipTextSelected: { color: colors.primaryText },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
});
