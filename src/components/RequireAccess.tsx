// src/components/RequireAccess.tsx
//
// Self-gating guard for admin/privileged screens reached via
// navigation.navigate(...) on the shared stack. Stack.Screen (unlike
// Tab.Screen's tabBarButton trick) has no conditional-render mechanism —
// hiding the button that navigates here isn't enough, since any
// authenticated user can still reach these routes directly (deep link, a
// stale nav state, programmatic navigation from another screen). The mock/
// real backend is still the actual authorization boundary; this is the
// same "hide it, but the server re-checks" pattern already used
// throughout the app (see usePermissions.ts doc comment), just applied at
// the screen level instead of the button level for screens that have no
// other content worth showing to an unauthorized viewer.
//
// Usage: `if (!allowed) return <RequireAccess />;` as the first line of a
// screen component, before any data-fetching hooks that assume the caller
// is authorized.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export default function RequireAccess({
  message = "You don't have permission to view this screen.",
}: {
  message?: string;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.title}>Access Restricted</Text>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: colors.background,
  },
  icon: { fontSize: 40, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 10, textAlign: "center" },
  body: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 21 },
});
