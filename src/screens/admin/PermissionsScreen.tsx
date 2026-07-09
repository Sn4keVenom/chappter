// src/screens/admin/PermissionsScreen.tsx
//
// "Roles should simply be permission presets" (spec §3) — Super Admin only
// (permissions.manage). Lets the Super Admin pick a role and toggle exactly
// which granular permissions that role's preset grants. SUPER_ADMIN itself
// isn't editable here — it always bypasses every check (see
// permissions/permissions.ts hasPermission()), so it can never be locked
// out by a bad edit.
//
// Integration:
//   - usePermissionsStore → fetchPermissions, updateRolePermissions, presets
//   - permissions/permissions.ts → PERMISSION_GROUPS, PERMISSION_LABELS,
//     EDITABLE_PRESET_ROLES
//   - Navigation: AppStackParamList → Permissions (no params)

import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, ActivityIndicator } from "react-native";
import { colors } from "../../theme/colors";
import { usePermissionsStore } from "../../store/usePermissionsStore";
import { PERMISSION_GROUPS, PERMISSION_LABELS, EDITABLE_PRESET_ROLES } from "../../permissions/permissions";
import type { Permission, UserRole } from "../../types";

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  EXEC: "Exec",
  MEMBER: "Member",
  PNM: "PNM",
  ALUMNI: "Alumni",
};

export default function PermissionsScreen() {
  const { presets, loaded, fetchPermissions, updateRolePermissions } = usePermissionsStore();
  const [selectedRole, setSelectedRole] = useState<UserRole>("EXEC");
  const [savingPermission, setSavingPermission] = useState<Permission | null>(null);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const rolePermissions = presets[selectedRole] ?? [];

  async function toggle(permission: Permission, enabled: boolean) {
    setSavingPermission(permission);
    const next = enabled
      ? [...rolePermissions, permission]
      : rolePermissions.filter((p) => p !== permission);
    try {
      await updateRolePermissions(selectedRole, next);
    } finally {
      setSavingPermission(null);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.roleTabRow}>
        {EDITABLE_PRESET_ROLES.map((role) => (
          <Pressable
            key={role}
            style={[styles.roleTab, selectedRole === role && styles.roleTabActive]}
            onPress={() => setSelectedRole(role)}
          >
            <Text style={[styles.roleTabText, selectedRole === role && styles.roleTabTextActive]}>
              {ROLE_LABEL[role]}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Super Admin always has unrestricted access and can't be edited here.
        </Text>
        {PERMISSION_GROUPS.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={styles.groupTitle}>{group.label}</Text>
            {group.permissions.map((permission) => {
              const enabled = rolePermissions.includes(permission);
              return (
                <View key={permission} style={styles.row}>
                  <Text style={styles.rowLabel}>{PERMISSION_LABELS[permission]}</Text>
                  <Switch
                    value={enabled}
                    onValueChange={(v) => toggle(permission, v)}
                    disabled={savingPermission === permission}
                    trackColor={{ true: colors.primary }}
                    thumbColor={colors.surface}
                  />
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  roleTabRow: { flexDirection: "row", backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  roleTab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  roleTabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  roleTabText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  roleTabTextActive: { color: colors.primary },
  content: { padding: 16, paddingBottom: 48 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 16, lineHeight: 17 },
  group: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 14, overflow: "hidden" },
  groupTitle: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, padding: 12, paddingBottom: 6 },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  rowLabel: { flex: 1, fontSize: 14, color: colors.textPrimary, marginRight: 8 },
});
