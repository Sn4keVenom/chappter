// src/screens/auth/ForgotPasswordScreen.tsx
//
// Requests a password-reset code via Clerk (spec §1). On success, navigates
// to ResetPasswordScreen to enter the code + new password.

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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSignIn } from "@clerk/clerk-expo";
import { colors } from "../../theme/colors";
import type { AuthStackParamList } from "../../navigation/types";

type NavProp = NativeStackNavigationProp<AuthStackParamList>;

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<NavProp>();
  const { isLoaded, signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!isLoaded || !email.trim()) return;
    setLoading(true);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      navigation.navigate("ResetPassword", { email: email.trim() });
    } catch (err: any) {
      Alert.alert("Couldn't send code", err?.errors?.[0]?.message ?? err?.message ?? "Check the email address and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.content}>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>Enter your account email and we'll send you a reset code.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          autoFocus
        />

        <Pressable
          style={[styles.primaryButton, (!email.trim() || loading) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!email.trim() || loading}
        >
          {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryButtonText}>Send Reset Code</Text>}
        </Pressable>

        <Pressable style={styles.backRow} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={styles.backText}>Back to log in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 24, paddingTop: 48 },
  title: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, marginBottom: 10 },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 28 },

  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },

  primaryButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  primaryButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },

  backRow: { marginTop: 20, alignItems: "center" },
  backText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
});
