// src/screens/NotImplementedScreen.tsx
//
// Honest placeholder for routes that exist in navigation/types.ts but have
// no backend support at all yet (no route in backend/routes/*.ts, no
// api/*.ts function) — AuditLog and Thread. Rather than rendering a blank
// white screen (the previous `() => null` stub) or inventing fake data for
// a feature that was never built, this says so clearly. Swap in a real
// screen once the corresponding backend endpoint exists.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { colors } from "../theme/colors";

const COPY: Record<string, { icon: string; title: string; body: string }> = {
  AuditLog: {
    icon: "🔒",
    title: "Audit Log — coming soon",
    body: "The backend doesn't expose an audit-log endpoint yet, even though every privileged action (role changes, attendance overrides, dues waivers) already writes an AuditLog row in the database. Wiring up a read endpoint and this screen is tracked as a follow-up.",
  },
  Thread: {
    icon: "💬",
    title: "Threaded replies — coming soon",
    body: "Message threading isn't wired into the Messaging tab's UI yet. The backend supports fetching a thread's replies; nothing currently links here.",
  },
};

export default function NotImplementedScreen() {
  const route = useRoute();
  const copy = COPY[route.name] ?? {
    icon: "🚧",
    title: "Coming soon",
    body: "This screen isn't built yet.",
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.icon}>{copy.icon}</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 },
  icon: { fontSize: 40, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 10, textAlign: "center" },
  body: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 21 },
});
