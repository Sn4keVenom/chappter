// src/navigation/RootNavigator.tsx
//
// Auth gate — the only navigator that reads from useAuthStore.
// Shows a spinner during the initial token verification (isLoading=true),
// then routes to AuthNavigator or AppNavigator based on whether user is set.
//
// Integration points:
//   · useAuthStore.ts — reads user + isLoading
//   · AuthNavigator.tsx / AppNavigator.tsx — the two branches
//   · RootStackParamList from navigation/types.ts

import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/useAuthStore";
import { colors } from "../theme/colors";
import AuthNavigator from "./AuthNavigator";
import AppNavigator from "./AppNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="App" component={AppNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
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
