// src/navigation/AuthNavigator.tsx
//
// Auth stack: Login (default), SignUp, VerifyEmail, ForgotPassword,
// ResetPassword. Each screen lives in src/screens/auth/ and shares the
// activate-session → sync → setUser tail via hooks/useCompleteAuth.ts.
//
// RootNavigator mounts this stack whenever useAuthStore.user is null; once
// any screen here calls setUser (via useCompleteAuth), RootNavigator
// re-renders into OnboardingNavigator or AppNavigator depending on
// hasChapter — no explicit navigation call needed at that point.

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme/colors";
import LoginScreen from "../screens/auth/LoginScreen";
import SignUpScreen from "../screens/auth/SignUpScreen";
import VerifyEmailScreen from "../screens/auth/VerifyEmailScreen";
import ForgotPasswordScreen from "../screens/auth/ForgotPasswordScreen";
import ResetPasswordScreen from "../screens/auth/ResetPasswordScreen";
import type { AuthStackParamList } from "./types";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ headerShown: true, title: "" }} />
    </Stack.Navigator>
  );
}
