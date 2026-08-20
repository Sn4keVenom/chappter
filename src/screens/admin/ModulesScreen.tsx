// src/screens/admin/ModulesScreen.tsx
//
// Module/feature toggle system (spec §5) — Super Admin only
// (modules.manage). Disabling a module hides its nav entry/tab and its
// AdminPanel section everywhere in the app (see useModulesStore.ts,
// AppNavigator.tsx, AdminPanelScreen.tsx) without needing per-screen
// changes — adding a future module is just one more entry in
// mocks/seed.ts moduleConfigs plus whatever screens back it.
//
// Integration:
//   - useModulesStore → fetchModules, setModuleEnabled, modules
//   - Navigation: AppStackParamList → Modules (no params)

import React, { useEffect } from "react";
import { View, Text, ScrollView, Switch, Pressable, ActivityIndicator } from "react-native";
import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { useModulesStore } from "../../store/useModulesStore";

export default function ModulesScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const { isSuperAdmin } = usePermissions();
  const { modules, loaded, error, fetchModules, setModuleEnabled } = useModulesStore();

  useEffect(() => { fetchModules(); }, [fetchModules]);

  if (!isSuperAdmin) {
    return <RequireAccess message="Only the Super Admin can enable or disable modules." />;
  }

  if (!loaded && error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={fetchModules}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Disabling a module hides it from navigation, menus, and dashboards everywhere in the app.
      </Text>
      {modules.map((m) => (
        <View key={m.key} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>{m.label}</Text>
            {m.description && <Text style={styles.rowDescription}>{m.description}</Text>}
            {m.comingSoon && <Text style={styles.comingSoon}>Coming soon — no screens attached yet</Text>}
          </View>
          <Switch
            value={m.enabled}
            onValueChange={(v) => setModuleEnabled(m.key, v)}
            trackColor={{ true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 },
  errorText: { color: colors.danger, fontSize: 14, textAlign: "center", marginBottom: 16 },
  retryBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  retryBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 18 },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 10,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowDescription: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  comingSoon: { fontSize: 11, color: colors.warning, marginTop: 4, fontWeight: "600" },
}));
