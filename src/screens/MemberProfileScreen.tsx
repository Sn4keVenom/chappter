// src/screens/MemberProfileScreen.tsx
//
// View another member's profile — reached from LeaderboardScreen and
// CommitteeDetailScreen member rows. Read-only for everyone; Exec+ sees an
// "Adjust Points" shortcut into PointsAdjustScreen.
//
// Integration:
//   - getMemberProfile, getPointsLedger → api/users.ts
//   - getMemberAttendanceHistory → api/attendance.ts
//   - usePermissions: isExecOrAbove gates "Adjust Points"
//   - Navigation: AppStackParamList → MemberProfile { userId: string }

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../theme/colors";
import { usePermissions } from "../hooks/usePermissions";
import { getMemberProfile, getPointsLedger } from "../api/users";
import { getMemberAttendanceHistory } from "../api/attendance";
import type { User, AttendanceRecord } from "../types";
import type { AppStackParamList } from "../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "MemberProfile">;

export default function MemberProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { userId } = route.params;
  const { isExecOrAbove } = usePermissions();

  const [profile, setProfile] = useState<User | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, hist, ledger] = await Promise.all([
        getMemberProfile(userId),
        getMemberAttendanceHistory(userId),
        getPointsLedger(userId, { limit: 200 }),
      ]);
      setProfile(me);
      setHistory(hist.records.slice(0, 8));
      setTotalPoints(ledger.entries.reduce((sum, e) => sum + e.amount, 0));
      navigation.setOptions({ title: `${me.firstName} ${me.lastName}` });
    } catch {
      /* handled by empty state below */
    } finally {
      setLoading(false);
    }
  }, [userId, navigation]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load this member.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitials}>{profile.firstName.charAt(0)}{profile.lastName.charAt(0)}</Text>
        </View>
        <Text style={styles.heroName}>{profile.firstName} {profile.lastName}</Text>
        <Text style={styles.heroRole}>{profile.role} · {profile.status}</Text>
        {profile.pledgeClassLabel && <Text style={styles.heroMeta}>{profile.pledgeClassLabel}</Text>}
        <Text style={styles.heroMeta}>{profile.email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Points this semester</Text>
        <Text style={styles.pointsTotal}>{totalPoints}</Text>
      </View>

      {isExecOrAbove && (
        <Pressable
          style={styles.adjustBtn}
          onPress={() =>
            navigation.navigate("PointsAdjust", {
              userId: profile.id,
              userName: `${profile.firstName} ${profile.lastName}`,
            })
          }
        >
          <Text style={styles.adjustBtnText}>⭐ Adjust Points</Text>
        </Pressable>
      )}

      {(profile.committeeMemberships?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Committees</Text>
          {profile.committeeMemberships!.map((m) => (
            <Pressable
              key={m.committeeId}
              style={styles.row}
              onPress={() => navigation.navigate("CommitteeDetail", { committeeId: m.committeeId })}
            >
              <Text style={styles.rowText}>{m.committeeName}</Text>
              <Text style={styles.rowMeta}>{m.role}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent attendance</Text>
          {history.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.row}
              onPress={() => navigation.navigate("EventDetail", { eventId: entry.event.id })}
            >
              <Text style={styles.rowText} numberOfLines={1}>{entry.event.title}</Text>
              <Text style={[styles.rowMeta, entry.late && { color: colors.warning }]}>
                +{entry.pointsAwarded}{entry.late ? " · Late" : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {history.length === 0 && (
        <Text style={styles.emptyText}>No attendance recorded yet this semester.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  errorText: { color: colors.textSecondary, fontSize: 15 },

  hero: { alignItems: "center", marginBottom: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarInitials: { fontSize: 26, fontWeight: "800", color: colors.primaryText },
  heroName: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  heroRole: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  heroMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },

  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cardLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  pointsTotal: { fontSize: 30, fontWeight: "800", color: colors.textPrimary },

  adjustBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center", marginBottom: 20 },
  adjustBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary, marginRight: 8 },
  rowMeta: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 20 },
});
