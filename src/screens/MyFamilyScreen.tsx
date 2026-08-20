// src/screens/MyFamilyScreen.tsx
//
// Big + Littles for a member (spec §7/§8 — the concrete foundation for
// future family-tree visualization/lineage navigation/generation calc: this
// screen and GET /users/:id/family already give the data + navigation path;
// a graphical tree is future UI on top of the same endpoint, not a schema
// change). Read-only here — assigning Big/Little happens from
// MemberProfileScreen's "Manage Member" section (membership.manageRelationships).
//
// Integration:
//   · api/membership.ts getFamily → GET /users/:id/family
//   · useAuthStore — resolves "self" when no userId param is given

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, FlatList } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";
import { useAuthStore } from "../store/useAuthStore";
import { getFamily } from "../api/membership";
import type { AppStackParamList } from "../navigation/types";
import type { FamilyMemberSummary } from "../types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "MyFamily">;

function FamilyRow({ member, onPress }: { member: FamilyMemberSummary; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{member.firstName.charAt(0)}{member.lastName.charAt(0)}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{member.firstName} {member.lastName}</Text>
        {member.roleNumber != null && <Text style={styles.rowMeta}>#{member.roleNumber}</Text>}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function MyFamilyScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const currentUser = useAuthStore((s) => s.user);
  const userId = route.params?.userId ?? currentUser?.id;

  const [big, setBig] = useState<FamilyMemberSummary | null>(null);
  const [littles, setLittles] = useState<FamilyMemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async ({ silent }: { silent: boolean } = { silent: false }) => {
    if (!userId) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const family = await getFamily(userId);
      setBig(family.big);
      setLittles(family.littles);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load family info.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusRefresh(load);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.sectionTitle}>Big</Text>
      {big ? (
        <FamilyRow member={big} onPress={() => navigation.push("MemberProfile", { userId: big.userId })} />
      ) : (
        <Text style={styles.emptyText}>No Big assigned yet.</Text>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Littles ({littles.length})</Text>
      {littles.length === 0 ? (
        <Text style={styles.emptyText}>No Littles yet.</Text>
      ) : (
        <FlatList
          data={littles}
          keyExtractor={(m) => m.userId}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <FamilyRow member={item} onPress={() => navigation.push("MemberProfile", { userId: item.userId })} />
          )}
        />
      )}
    </View>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background, padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  errorText: { color: colors.textSecondary, fontSize: 14 },

  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  emptyText: { color: colors.textMuted, fontSize: 14 },

  row: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: colors.primaryText, fontWeight: "800", fontSize: 14 },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  chevron: { fontSize: 20, color: colors.textMuted, fontWeight: "300" },
}));
