// src/screens/FeedbackScreen.tsx
//
// In-app feedback & bug reports (spec §9). Open to every member — no
// permission gate on submission itself, only on viewing/managing the list
// of everyone's submissions (see admin/FeedbackListScreen.tsx). Captures
// app version + platform automatically for troubleshooting.
//
// Integration:
//   - submitFeedback → api/feedback.ts
//   - expo-constants → app version; react-native Platform → OS
//   - Navigation: AppStackParamList → Feedback (no params)

import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";
import { submitFeedback } from "../api/feedback";
import type { FeedbackType } from "../types";

const TYPES: { value: FeedbackType; label: string; icon: string }[] = [
  { value: "BUG", label: "Bug Report", icon: "🐛" },
  { value: "FEATURE_REQUEST", label: "Feature Request", icon: "💡" },
  { value: "GENERAL", label: "General Feedback", icon: "💬" },
];

export default function FeedbackScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<any>();
  const [type, setType] = useState<FeedbackType>("BUG");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) { Alert.alert("Please describe your feedback"); return; }
    setSubmitting(true);
    try {
      await submitFeedback({
        type,
        message: message.trim(),
        appVersion: Constants.expoConfig?.version ?? "unknown",
        platform: Platform.OS,
      });
      Alert.alert("Thank you!", "Your feedback has been submitted.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not submit feedback");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Type</Text>
      <View style={styles.typeRow}>
        {TYPES.map((t) => (
          <Pressable
            key={t.value}
            style={[styles.typeChip, type === t.value && styles.typeChipSelected]}
            onPress={() => setType(t.value)}
          >
            <Text style={styles.typeIcon}>{t.icon}</Text>
            <Text style={[styles.typeLabel, type === t.value && styles.typeLabelSelected]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Message</Text>
      <TextInput
        style={styles.messageInput}
        value={message}
        onChangeText={setMessage}
        placeholder="What's on your mind?"
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
      />

      <Text style={styles.metaHint}>
        App version {Constants.expoConfig?.version ?? "unknown"} · {Platform.OS} — included automatically to help with troubleshooting.
      </Text>

      <Pressable style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  typeRow: { gap: 8, marginBottom: 8 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14 },
  typeChipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  typeIcon: { fontSize: 18 },
  typeLabel: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  typeLabelSelected: { color: colors.primaryTint },
  messageInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, color: colors.textPrimary, fontSize: 15, minHeight: 140,
  },
  metaHint: { fontSize: 11, color: colors.textMuted, marginTop: 10, lineHeight: 16 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
}));
