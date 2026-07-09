// src/screens/auth/VerifyEmailScreen.tsx
//
// 6-digit email verification code (spec §1/§2). On success, activates the
// session and syncs the DB row via useCompleteAuth — RootNavigator then
// reactively routes into OnboardingNavigator (useAuthStore.user.hasChapter
// is false for a brand-new account), which is the "prompt the user to join
// a chapter" step. No role is ever assigned here.

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
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useSignUp } from "@clerk/clerk-expo";
import { useCompleteAuth } from "../../hooks/useCompleteAuth";
import { colors } from "../../theme/colors";
import type { AuthStackParamList } from "../../navigation/types";

type NavProp = NativeStackNavigationProp<AuthStackParamList>;
type RoutePropType = RouteProp<AuthStackParamList, "VerifyEmail">;

export default function VerifyEmailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { email, phone } = route.params;
  const { isLoaded, signUp } = useSignUp();
  const completeAuth = useCompleteAuth();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify() {
    if (!isLoaded || code.trim().length === 0) return;
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error("That code didn't work — double-check it and try again.");
      }
      await completeAuth(result.createdSessionId, { phone });
    } catch (err: any) {
      Alert.alert("Verification failed", err?.errors?.[0]?.message ?? err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!isLoaded) return;
    setResending(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      Alert.alert("Code sent", `A new code was sent to ${email}.`);
    } catch (err: any) {
      Alert.alert("Couldn't resend", err?.message ?? "Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.content}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code we sent to{"\n"}
          <Text style={styles.emailText}>{email}</Text>
        </Text>

        <TextInput
          style={styles.codeInput}
          placeholder="000000"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          autoFocus
        />

        <Pressable
          style={[styles.primaryButton, (loading || code.trim().length === 0) && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading || code.trim().length === 0}
        >
          {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryButtonText}>Verify Email</Text>}
        </Pressable>

        <Pressable onPress={handleResend} disabled={resending} style={styles.resendRow}>
          <Text style={styles.resendText}>{resending ? "Sending…" : "Didn't get a code? Resend"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 24, paddingTop: 48, alignItems: "center" },
  title: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, marginBottom: 10 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 32 },
  emailText: { fontWeight: "700", color: colors.textPrimary },

  codeInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 8,
    textAlign: "center",
    color: colors.textPrimary,
    paddingVertical: 16,
    width: "100%",
    marginBottom: 24,
  },

  primaryButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center", width: "100%" },
  primaryButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },

  resendRow: { marginTop: 20 },
  resendText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
});
