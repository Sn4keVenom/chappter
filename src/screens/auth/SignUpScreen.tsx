// src/screens/auth/SignUpScreen.tsx
//
// Account creation (spec §2): First/Last name, Username, Email, Password,
// Confirm Password, Phone (optional). Phone is intentionally never sent to
// Clerk — it's just a profile field on our own User row (see
// backend/routes/auth.routes.ts) — so signing up never triggers Clerk's
// phone-verification requirements. Architected so SMS verification could be
// added later as an additional Clerk strategy without a schema change (see
// implementation plan's "phone number" note).
//
// After Clerk accepts the sign-up, this navigates to VerifyEmailScreen
// (spec: "Verify email → Create account → Prompt to join a chapter" — the
// DB row and chapter-join prompt happen after verification completes, in
// VerifyEmailScreen / OnboardingNavigator). No role is ever assigned here.

import React, { useState } from "react";
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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSignUp } from "@clerk/clerk-expo";
import { colors } from "../../theme/colors";
import type { AuthStackParamList } from "../../navigation/types";

type NavProp = NativeStackNavigationProp<AuthStackParamList>;

const USERNAME_PATTERN = /^[a-zA-Z0-9_.]{3,30}$/;

export default function SignUpScreen() {
  const navigation = useNavigation<NavProp>();
  const { isLoaded, signUp } = useSignUp();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const usernameValid = USERNAME_PATTERN.test(username);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit =
    firstName.trim().length > 0 &&
    email.trim().length > 0 &&
    usernameValid &&
    password.length >= 8 &&
    passwordsMatch;

  async function handleSignUp() {
    if (!isLoaded || !canSubmit) return;
    setLoading(true);
    try {
      await signUp.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      navigation.navigate("VerifyEmail", { email: email.trim(), phone: phone.trim() || undefined });
    } catch (err: any) {
      Alert.alert("Couldn't create account", err?.errors?.[0]?.message ?? err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>You'll join a chapter in the next step.</Text>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="First name"
            placeholderTextColor={colors.textMuted}
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Last name"
            placeholderTextColor={colors.textMuted}
            value={lastName}
            onChangeText={setLastName}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        {username.length > 0 && !usernameValid && (
          <Text style={styles.hintError}>3–30 characters: letters, numbers, underscore, period.</Text>
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {confirmPassword.length > 0 && !passwordsMatch && (
          <Text style={styles.hintError}>Passwords don't match.</Text>
        )}

        <TextInput
          style={styles.input}
          placeholder="Phone number (optional)"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <Pressable
          style={[styles.primaryButton, (!canSubmit || loading) && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={!canSubmit || loading}
        >
          {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryButtonText}>Create Account</Text>}
        </Pressable>

        <Pressable style={styles.backRow} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={styles.backText}>Already have an account? <Text style={styles.backLink}>Log in</Text></Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 24, paddingTop: 32, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: "800", color: colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },

  row: { flexDirection: "row", gap: 12 },
  halfInput: { flex: 1 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintError: { color: colors.danger, fontSize: 12, marginTop: -8, marginBottom: 10 },

  primaryButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },

  backRow: { marginTop: 20, alignItems: "center" },
  backText: { color: colors.textSecondary, fontSize: 14 },
  backLink: { color: colors.primary, fontWeight: "700" },
});
