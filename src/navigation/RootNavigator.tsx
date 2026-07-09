// src/navigation/RootNavigator.tsx
//
// Auth gate — the only navigator that reads from useAuthStore.
// Shows a spinner during the initial token verification (isLoading=true),
// then routes three ways:
//   no user                     → AuthNavigator (login/sign-up/etc.)
//   user, but !hasChapter       → OnboardingNavigator (spec §2/§3 — never
//                                 auto-assigned; join-chapter/pending-approval)
//   user, hasChapter            → AppNavigator (the real app)
//
// Also configures deep linking for invite links (chapterhub://join?code=XXXX)
// so tapping one opens straight into JoinChapterScreen with the code
// pre-filled — see JoinChapterScreen's route params.
//
// Integration points:
//   · useAuthStore.ts — reads user + isLoading
//   · AuthNavigator.tsx / OnboardingNavigator.tsx / AppNavigator.tsx — the three branches
//   · RootStackParamList from navigation/types.ts

import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer, LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/useAuthStore";
import { colors } from "../theme/colors";
import AuthNavigator from "./AuthNavigator";
import OnboardingNavigator from "./OnboardingNavigator";
import AppNavigator from "./AppNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["chapterhub://"],
  config: {
    screens: {
      // Matches chapterhub://join?code=XXXX. Only resolves once the user is
      // already signed in and routed into Onboarding — if they tap the link
      // signed out, they land on Login first and can re-open the link (or
      // enter the code manually) once they're in.
      Onboarding: { screens: { JoinChapter: "join" } },
    },
  },
};

export default function RootNavigator() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : !user.hasChapter ? (
          <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
        ) : (
          <Stack.Screen name="App" component={AppNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
