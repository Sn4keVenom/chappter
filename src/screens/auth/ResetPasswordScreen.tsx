// src/screens/auth/ResetPasswordScreen.tsx
//
// Completes the password reset: code + new password + confirm (spec §1).
// On success, activates the session and syncs the DB row via
// useCompleteAuth — same as the other post-verification entry points.

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useSignIn } from "@clerk/clerk-expo";
import { useCompleteAuth } from "../../hooks/useCompleteAuth";
import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import type { AuthStackParamList } from "../../navigation/types";

type RoutePropType = RouteProp<AuthStackParamList, "ResetPassword">;

export default function ResetPasswordScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const route = useRoute<RoutePropType>();
  const { email } = route.params;
  const { isLoaded, signIn } = useSignIn();
  const completeAuth = useCompleteAuth();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = code.trim().length > 0 && password.length >= 8 && passwordsMatch;

  async function handleReset() {
    if (!isLoaded || !canSubmit) return;
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password,
      });
      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error("That code didn't work — double-check it and try again.");
      }
      await completeAuth(result.createdSessionId);
    } catch (err: any) {
      Alert.alert("Couldn't reset password", err?.errors?.[0]?.message ?? err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Enter your new password</Text>
        <Text style={styles.subtitle}>
          Enter the code sent to <Text style={styles.emailText}>{email}</Text> and choose a new password.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Reset code"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
          autoFocus
        />
        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {confirmPassword.length > 0 && !passwordsMatch && (
          <Text style={styles.hintError}>Passwords don't match.</Text>
        )}

        <Pressable
          style={[styles.primaryButton, (!canSubmit || loading) && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={!canSubmit || loading}
        >
          {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryButtonText}>Reset Password</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 24, paddingTop: 48 },
  title: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, marginBottom: 10 },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 28 },
  emailText: { fontWeight: "700", color: colors.textPrimary },

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
  hintError: { color: colors.danger, fontSize: 12, marginTop: -6, marginBottom: 10 },

  primaryButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
}));
