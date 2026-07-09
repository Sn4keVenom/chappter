// src/screens/EditProfileScreen.tsx
//
// Self-service profile editor (spec §9/§13) — closes the previous gap where
// no self-edit flow existed at all (the only mutation path was the
// Super-Admin-only editor on MemberProfileScreen). Never exposes role/
// office/status/roleNumber — those remain admin-only by design.
//
// Integration:
//   · api/users.ts updateMyProfile → PATCH /users/me
//   · useAuthStore — refreshes major/graduationYear after a successful save

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { getMe, updateMyProfile } from "../api/users";
import { useAuthStore } from "../store/useAuthStore";
import { colors } from "../theme/colors";

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [major, setMajor] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        setFirstName(me.firstName);
        setLastName(me.lastName);
        setPhone(me.phone ?? "");
        setAvatarUrl(me.avatarUrl ?? "");
        setMajor(me.major ?? "");
        setGraduationYear(me.graduationYear ? String(me.graduationYear) : "");
      } catch {
        /* fields stay blank — the form still works, just without prefill */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    if (!firstName.trim()) {
      Alert.alert("First name required");
      return;
    }
    const parsedYear = graduationYear.trim() ? Number(graduationYear.trim()) : null;
    if (graduationYear.trim() && (!Number.isInteger(parsedYear) || parsedYear! < 1900)) {
      Alert.alert("Invalid graduation year");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        major: major.trim() || null,
        graduationYear: parsedYear,
      });
      setUser({
        ...user!,
        firstName: updated.firstName,
        lastName: updated.lastName,
        major: updated.major,
        graduationYear: updated.graduationYear,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>First Name</Text>
        <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Last Name</Text>
        <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Optional"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Profile Picture URL</Text>
        <TextInput
          style={styles.input}
          value={avatarUrl}
          onChangeText={setAvatarUrl}
          autoCapitalize="none"
          placeholder="Optional"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Major</Text>
        <TextInput
          style={styles.input}
          value={major}
          onChangeText={setMajor}
          placeholder="Optional"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Graduation Year</Text>
        <TextInput
          style={styles.input}
          value={graduationYear}
          onChangeText={setGraduationYear}
          keyboardType="number-pad"
          placeholder="Optional"
          placeholderTextColor={colors.textMuted}
        />

        <Pressable style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },

  label: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.textPrimary,
  },

  saveButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 28 },
  saveButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.6 },
});
