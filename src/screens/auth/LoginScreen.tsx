// src/screens/auth/LoginScreen.tsx
//
// Email-or-username + password sign-in, plus Google/Apple SSO. Clean, dark
// hero matching the app's "professional, not social" direction — one screen,
// one primary action, secondary options below the fold.
//
// Apple Sign-In uses the NATIVE flow on iOS (Apple's own
// AppleAuthenticationButton + AuthenticationServices under the hood, via
// expo-apple-authentication + Clerk's useSignInWithApple) — required for a
// properly App-Store-guideline-4.8-compliant, HIG-styled experience, not
// just "some way to sign in with Apple." Falls back to Clerk's web-OAuth
// flow (same mechanism as Google) on Android/web, where there's no native
// Sign in with Apple UI to speak of.
//
// Integration:
//   · @clerk/clerk-expo useSignIn() — password sign-in
//   · @clerk/clerk-expo useSSO() — Google, and Apple's non-iOS fallback
//   · @clerk/clerk-expo useSignInWithApple() + expo-apple-authentication —
//     native Apple on iOS (see app.json: usesAppleSignIn + the
//     expo-apple-authentication config plugin)
//   · hooks/useCompleteAuth.ts — shared activate-session → sync → setUser tail
//   · navigation/types.ts AuthStackParamList

import React, { useEffect, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSignIn, useSSO, useSignInWithApple } from "@clerk/clerk-expo";
import * as AppleAuthentication from "expo-apple-authentication";
import { useCompleteAuth } from "../../hooks/useCompleteAuth";
import { setAuthToken } from "../../api/client";
import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { withAlpha } from "../../theme/contrast";
import { useTheme } from "../../theme/ThemeProvider";
import type { AuthStackParamList } from "../../navigation/types";

type NavProp = NativeStackNavigationProp<AuthStackParamList>;

export default function LoginScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<NavProp>();
  const { isLoaded, signIn } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const completeAuth = useCompleteAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState<"password" | "google" | "apple" | null>(null);
  const [nativeAppleAvailable, setNativeAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync().then(setNativeAppleAvailable);
  }, []);

  async function handlePasswordSignIn() {
    if (!isLoaded || !identifier.trim() || !password) return;
    setLoading("password");
    try {
      const result = await signIn.create({ identifier: identifier.trim(), password });
      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error("Additional verification is required for this account.");
      }
      await completeAuth(result.createdSessionId, undefined, { rememberMe });
    } catch (err: any) {
      Alert.alert("Sign in failed", err?.errors?.[0]?.message ?? err?.message ?? "Check your email/username and password.");
    } finally {
      setLoading(null);
    }
  }

  // A missing createdSessionId can mean the user genuinely cancelled the
  // browser flow, OR that Clerk needs more info to finish creating the
  // account (e.g. this provider's account has no email) — those aren't the
  // same thing, and silently doing nothing for the second case leaves the
  // user thinking their tap didn't register. There's no "collect the missing
  // field" UI here (that's a bigger flow than this app currently has), so
  // the honest, minimal fix is telling them what happened instead of nothing.
  function explainIncompleteSSO(result: { signUp?: { status?: string | null } | null; signIn?: { status?: string | null } | null }) {
    if (result.signUp?.status === "missing_requirements" || result.signIn?.status === "missing_requirements") {
      Alert.alert(
        "Almost there",
        "This account needs additional information to finish signing in. Try creating an account with your email instead."
      );
    }
  }

  async function handleGoogleSignIn() {
    setLoading("google");
    try {
      const result = await startSSOFlow({ strategy: "oauth_google" });
      if (!result.createdSessionId) {
        explainIncompleteSSO(result); // no-op if this was a genuine cancellation
        return;
      }
      await completeAuth(result.createdSessionId, undefined, { rememberMe });
    } catch (err: any) {
      setAuthToken(null);
      Alert.alert("Sign in failed", err?.message ?? "Couldn't connect — check your network and try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleAppleSignIn() {
    setLoading("apple");
    try {
      if (Platform.OS === "ios" && nativeAppleAvailable) {
        const { createdSessionId } = await startAppleAuthenticationFlow();
        if (!createdSessionId) return; // user cancelled — native flow has no comparable "missing requirements" result to inspect
        await completeAuth(createdSessionId, undefined, { rememberMe });
        return;
      }
      // Android/web, or an iOS device somehow reporting native Apple auth
      // unavailable — same web-OAuth mechanism as Google.
      const result = await startSSOFlow({ strategy: "oauth_apple" });
      if (!result.createdSessionId) {
        explainIncompleteSSO(result);
        return;
      }
      await completeAuth(result.createdSessionId, undefined, { rememberMe });
    } catch (err: any) {
      // expo-apple-authentication throws this specific code when the user
      // dismisses the native sheet — not a real error, just a cancellation.
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      setAuthToken(null);
      Alert.alert("Sign in failed", err?.message ?? "Couldn't connect — check your network and try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoMark}>ΘΤ</Text>
          </View>
          <Text style={styles.appName}>ChapterHub</Text>
          <Text style={styles.tagline}>Theta Tau Chapter Operations</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email or username"
            placeholderTextColor={withAlpha(colors.primaryText, 0.45)}
            autoCapitalize="none"
            autoCorrect={false}
            value={identifier}
            onChangeText={setIdentifier}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={withAlpha(colors.primaryText, 0.45)}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={styles.rememberRow} onPress={() => setRememberMe((v) => !v)}>
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.rememberText}>Remember me</Text>
          </Pressable>

          <Pressable
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handlePasswordSignIn}
            disabled={!!loading || !identifier.trim() || !password}
          >
            {loading === "password" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.primaryButtonText}>Log In</Text>
            )}
          </Pressable>

          <Pressable onPress={() => navigation.navigate("ForgotPassword")} disabled={!!loading}>
            <Text style={styles.linkText}>Forgot password?</Text>
          </Pressable>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.ssoRow}>
          <Pressable
            style={[styles.ssoButton, loading && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={!!loading}
          >
            {loading === "google" ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.ssoButtonText}>Google</Text>
            )}
          </Pressable>

          {Platform.OS === "ios" && nativeAppleAvailable ? (
            // Apple's own pre-styled button (AuthenticationServices under
            // the hood) — required for App Store guideline 4.8 / Apple HIG
            // compliance, not just "some Apple sign-in option."
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              style={[styles.ssoButton, styles.appleNativeButton, loading && styles.buttonDisabled]}
              onPress={handleAppleSignIn}
            />
          ) : (
            <Pressable
              style={[styles.ssoButton, loading && styles.buttonDisabled]}
              onPress={handleAppleSignIn}
              disabled={!!loading}
            >
              {loading === "apple" ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.ssoButtonText}>Apple</Text>
              )}
            </Pressable>
          )}
        </View>

        <Pressable style={styles.createAccountRow} onPress={() => navigation.navigate("SignUp")} disabled={!!loading}>
          <Text style={styles.createAccountText}>
            Don't have an account? <Text style={styles.createAccountLink}>Create one</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.primary },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 72, paddingBottom: 40 },
  hero: { alignItems: "center", marginBottom: 36 },
  logoContainer: {
    width: 80, height: 80, borderRadius: 20, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  logoMark: { fontSize: 32, fontWeight: "700", color: colors.accentText, letterSpacing: 1 },
  appName: { fontSize: 30, fontWeight: "800", color: colors.primaryText, letterSpacing: -0.5, marginBottom: 6 },
  tagline: { fontSize: 14, color: withAlpha(colors.primaryText, 0.65), letterSpacing: 0.2 },

  form: { marginBottom: 24 },
  input: {
    backgroundColor: withAlpha(colors.primaryText, 0.1),
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.primaryText,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: withAlpha(colors.primaryText, 0.15),
  },
  rememberRow: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: withAlpha(colors.primaryText, 0.4),
    marginRight: 10, alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxMark: { color: colors.accentText, fontSize: 13, fontWeight: "800" },
  rememberText: { color: withAlpha(colors.primaryText, 0.8), fontSize: 14 },

  primaryButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginBottom: 16 },
  primaryButtonText: { color: colors.accentText, fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.6 },
  linkText: { color: colors.primaryText, fontSize: 13, textAlign: "center", textDecorationLine: "underline" },

  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: withAlpha(colors.primaryText, 0.15) },
  dividerText: { color: withAlpha(colors.primaryText, 0.5), fontSize: 12, marginHorizontal: 12 },

  ssoRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  ssoButton: {
    flex: 1, backgroundColor: colors.surface, paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  ssoButtonText: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  // AppleAuthenticationButton is a native view that sizes its own content —
  // it needs an explicit height instead of the paddingVertical the plain
  // Pressable siblings use, but keeps flex:1 from ssoButton for equal width.
  appleNativeButton: { height: 48, paddingVertical: 0 },

  createAccountRow: { marginTop: 28, alignItems: "center" },
  createAccountText: { color: withAlpha(colors.primaryText, 0.75), fontSize: 14 },
  createAccountLink: { color: colors.accent, fontWeight: "700" },
}));
