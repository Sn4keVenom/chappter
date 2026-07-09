// src/screens/CreateEventScreen.tsx
//
// Integration points:
//   · POST /events via apiClient (same shape as createEventSchema in events.routes.ts)
//   · listCommittees() for committee picker chips
//   · usePermissions — only Officer+ can reach this screen (gate is in AppNavigator)
//   · EventCategory from types/index.ts for category chips
//   · colors.ts for consistent styling

import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  Switch, Alert, ActivityIndicator, Platform
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import { apiClient } from "../api/client";
import { listCommittees } from "../api/committees";
import { colors } from "../theme/colors";
import type { EventCategory, Committee } from "../types";

const CATEGORIES: EventCategory[] = ["BROTHERHOOD", "SERVICE", "PROFESSIONAL", "RUSH", "ADMIN"];

export default function CreateEventScreen() {
  const navigation = useNavigation<any>();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<EventCategory>("BROTHERHOOD");
  const [startTime, setStartTime] = useState(new Date(Date.now() + 3600000));
  const [endTime, setEndTime] = useState(new Date(Date.now() + 7200000));
  const [attendanceRequired, setAttendanceRequired] = useState(false);
  const [pointValue, setPointValue] = useState("5");
  const [committeeId, setCommitteeId] = useState<string | null>(null);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCommittees().then(setCommittees).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiClient.post("/events", {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        category,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        attendanceRequired,
        pointValue: Number(pointValue) || 0,
        committeeId: committeeId ?? undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't create event — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onStartChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowStartPicker(false);
    if (date) setStartTime(date);
  };

  const onEndChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowEndPicker(false);
    if (date) setEndTime(date);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Title *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Event name"
        placeholderTextColor={colors.textMuted}
        maxLength={200}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Details, agenda, what to bring…"
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={4}
        maxLength={2000}
      />

      <Text style={styles.label}>Location</Text>
      <TextInput
        style={styles.input}
        value={location}
        onChangeText={setLocation}
        placeholder="Room number, building, or address"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategory(cat)}
            style={[styles.chip, category === cat && styles.chipSelected]}
          >
            <Text style={[styles.chipText, category === cat && styles.chipTextSelected]}>
              {cat.charAt(0) + cat.slice(1).toLowerCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Start</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowStartPicker(true)}>
        <Text style={styles.dateButtonText}>{formatDT(startTime)}</Text>
      </Pressable>
      {showStartPicker && (
        <DateTimePicker
          value={startTime}
          mode="datetime"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onStartChange}
          minimumDate={new Date()}
        />
      )}

      <Text style={styles.label}>End</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowEndPicker(true)}>
        <Text style={styles.dateButtonText}>{formatDT(endTime)}</Text>
      </Pressable>
      {showEndPicker && (
        <DateTimePicker
          value={endTime}
          mode="datetime"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onEndChange}
          minimumDate={startTime}
        />
      )}

      <Text style={styles.label}>Point Value</Text>
      <TextInput
        style={styles.input}
        value={pointValue}
        onChangeText={(t) => setPointValue(t.replace(/[^0-9]/g, ""))}
        keyboardType="numeric"
        maxLength={4}
        placeholder="0"
        placeholderTextColor={colors.textMuted}
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Attendance Required</Text>
        <Switch
          value={attendanceRequired}
          onValueChange={setAttendanceRequired}
          trackColor={{ true: colors.primary }}
        />
      </View>

      {committees.length > 0 && (
        <>
          <Text style={styles.label}>Committee (optional)</Text>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setCommitteeId(null)}
              style={[styles.chip, !committeeId && styles.chipSelected]}
            >
              <Text style={[styles.chipText, !committeeId && styles.chipTextSelected]}>
                Chapter-wide
              </Text>
            </Pressable>
            {committees.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCommitteeId(c.id)}
                style={[styles.chip, committeeId === c.id && styles.chipSelected]}
              >
                <Text style={[styles.chipText, committeeId === c.id && styles.chipTextSelected]}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Pressable
        style={[styles.submitButton, saving && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.submitText}>Create Event</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function formatDT(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  error: { color: colors.danger, fontSize: 13, marginBottom: 16, textAlign: "center" },
  label: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  multiline: { height: 100, textAlignVertical: "top", paddingTop: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  chipTextSelected: { color: colors.primaryText },
  dateButton: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  dateButtonText: { fontSize: 15, color: colors.textPrimary },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  switchLabel: { fontSize: 15, color: colors.textPrimary, fontWeight: "600" },
  submitButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 32 },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
});
