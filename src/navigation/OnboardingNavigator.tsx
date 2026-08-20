// src/navigation/OnboardingNavigator.tsx
//
// Mounted by RootNavigator whenever the signed-in user has no chapter
// membership yet (useAuthStore.user.hasChapter === false — spec §2/§3,
// never auto-assigned). Picks PendingApproval over JoinChapter when a
// request is already outstanding so a user who requested to join doesn't
// see the join options again on every app open.

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/useAuthStore";
import { useTheme, ThemedStatusBar } from "../theme/ThemeProvider";
import JoinChapterScreen from "../screens/onboarding/JoinChapterScreen";
import PendingApprovalScreen from "../screens/onboarding/PendingApprovalScreen";
import type { OnboardingStackParamList } from "./types";

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  const pendingJoinRequest = useAuthStore((s) => s.user?.pendingJoinRequest);
  const hasPending = pendingJoinRequest?.status === "PENDING";
  const { colors } = useTheme();

  return (
    <>
      <ThemedStatusBar behind="background" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
        initialRouteName={hasPending ? "PendingApproval" : "JoinChapter"}
      >
        <Stack.Screen name="JoinChapter" component={JoinChapterScreen} />
        <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      </Stack.Navigator>
    </>
  );
}
