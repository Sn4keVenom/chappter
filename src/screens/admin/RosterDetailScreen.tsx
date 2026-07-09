// src/screens/admin/RosterDetailScreen.tsx
//
// Full searchable chapter roster. Reached from AdminPanelScreen's "Active
// Members" stat card and "Member Roster" action row (Officer+ only, gated
// by AppNavigator's tab visibility upstream).
//
// Integration:
//   - getRoster → api/users.ts
//   - Navigation: AppStackParamList → RosterDetail (no params)
//   - Navigates to MemberProfile on row tap

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../../theme/colors";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { getRoster } from "../../api/users";
import type { UserSummary, UserRole, MemberStatus } from "../../types";
import type { AppStackParamList } from "../../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;

const ROLES: UserRole[] = ["MEMBER", "EXEC", "SUPER_ADMIN", "PNM", "ALUMNI"];
const STATUSES: MemberStatus[] = ["ACTIVE", "PNM", "ALUMNI", "INACTIVE"];

const ROLE_COLOR: Record<UserRole, string> = {
  MEMBER: colors.textMuted,
  EXEC: colors.accent,
  SUPER_ADMIN: colors.primary,
  PNM: colors.categoryRush,
  ALUMNI: colors.categoryBrotherhood,
};

export default function RosterDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const { isOfficerOrAbove } = usePermissions();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null);
  const [statusFilter, setStatusFilter] = useState<MemberStatus | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRoster({
        q: query || undefined,
        role: roleFilter ?? undefined,
        status: statusFilter ?? undefined,
        limit: 100,
      });
      setUsers(result.users);
      setTotal(result.total);
    } catch {
      /* keep previous list */
    } finally {
      setLoading(false);
    }
  }, [query, roleFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  if (!isOfficerOrAbove) {
    return <RequireAccess message="Only Exec+ or a committee chair can view the full roster." />;
  }

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or email…"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        clearButtonMode="while-editing"
      />

      <View style={styles.filterRow}>
        {ROLES.map((r) => (
          <Pressable
            key={r}
            style={[styles.chip, roleFilter === r && styles.chipSelected]}
            onPress={() => setRoleFilter(roleFilter === r ? null : r)}
          >
            <Text style={[styles.chipText, roleFilter === r && styles.chipTextSelected]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filterRow}>
        {STATUSES.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, statusFilter === s && styles.chipSelected]}
            onPress={() => setStatusFilter(statusFilter === s ? null : s)}
          >
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextSelected]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.countText}>{total} {total === 1 ? "member" : "members"}</Text>

      {loading && !users.length ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No members match these filters.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate("MemberProfile", { userId: item.id })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.firstName.charAt(0)}{item.lastName.charAt(0)}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.rowMeta}>{item.email}{item.pledgeClassLabel ? ` · ${item.pledgeClassLabel}` : ""}</Text>
              </View>
              <View style={[styles.roleBadge, { borderColor: ROLE_COLOR[item.role] }]}>
                <Text style={[styles.roleBadgeText, { color: ROLE_COLOR[item.role] }]}>{item.role}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchInput: { margin: 16, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.textPrimary },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  chipTextSelected: { color: colors.primaryText },
  countText: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, marginTop: 4, marginBottom: 4 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingTop: 4, gap: 8, paddingBottom: 40 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  roleBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  roleBadgeText: { fontSize: 10, fontWeight: "800" },
});
