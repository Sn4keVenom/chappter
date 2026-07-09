// src/screens/MemberProfileScreen.tsx
//
// View another member's profile — reached from LeaderboardScreen and
// CommitteeDetailScreen member rows. Read-only for everyone (including
// Big/Littles — same visibility as committee memberships); Exec+ sees an
// "Adjust Points" shortcut into PointsAdjustScreen. Super Admin additionally
// sees a "Manage Member" section to reassign role/office/status (spec §4).
// Role Number and Big are separate rows in that section, each gated by
// their own permission (membership.assignRoleNumber / .manageRelationships —
// spec §6/§11), not folded into the Super-Admin-only role/office/status
// editor, since the spec calls them out as distinct concerns (e.g. a Scribe
// who isn't Super Admin can still assign role numbers).
//
// Integration:
//   - getMemberProfile, getPointsLedger, updateUserFields, getRoster → api/users.ts
//   - getMemberAttendanceHistory → api/attendance.ts
//   - getFamily, setBig, setRoleNumber → api/membership.ts
//   - usePermissions: isExecOrAbove gates "Adjust Points", isSuperAdmin gates
//     the role/office/status editor, can("membership.assignRoleNumber") /
//     can("membership.manageRelationships") gate their own rows
//   - Navigation: AppStackParamList → MemberProfile { userId: string }

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert,
  Modal, TextInput, FlatList,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../theme/colors";
import { usePermissions } from "../hooks/usePermissions";
import { getMemberProfile, getPointsLedger, updateUserFields, getRoster } from "../api/users";
import { getMemberAttendanceHistory } from "../api/attendance";
import { getFamily, setBig as apiSetBig, setRoleNumber as apiSetRoleNumber } from "../api/membership";
import type { User, AttendanceRecord, UserRole, ExecOffice, MemberStatus, UserSummary, FamilyMemberSummary } from "../types";
import type { AppStackParamList } from "../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "MemberProfile">;

const ASSIGNABLE_ROLES: UserRole[] = ["SUPER_ADMIN", "EXEC", "MEMBER", "PNM", "ALUMNI"];
const ASSIGNABLE_OFFICES: ExecOffice[] = [
  "REGENT", "VICE_REGENT", "TREASURER", "SCRIBE", "MARSHAL", "CORRESPONDING_SECRETARY", "NEW_MEMBER_EDUCATOR",
];
const ASSIGNABLE_STATUSES: MemberStatus[] = ["ACTIVE", "PNM", "ALUMNI", "INACTIVE"];

function officeLabel(office?: ExecOffice | null): string {
  if (!office) return "";
  return office.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
}

// ── Role Number modal ────────────────────────────────────────────────────
function RoleNumberModal({
  visible, current, onClose, onSave,
}: {
  visible: boolean;
  current: number | null | undefined;
  onClose: () => void;
  onSave: (value: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setValue(current != null ? String(current) : "");
  }, [visible, current]);

  async function handleSave(next: number | null) {
    setSaving(true);
    try {
      await onSave(next);
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Role Number</Text>
          <TextInput
            style={styles.modalInput}
            keyboardType="number-pad"
            placeholder="e.g. 214"
            placeholderTextColor={colors.textMuted}
            value={value}
            onChangeText={setValue}
            autoFocus
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            {current != null && (
              <Pressable style={styles.modalClearBtn} onPress={() => handleSave(null)} disabled={saving}>
                <Text style={styles.modalClearText}>Clear</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.modalSaveBtn, (!value.trim() || saving) && styles.disabledBtn]}
              onPress={() => handleSave(Number(value.trim()))}
              disabled={!value.trim() || saving}
            >
              {saving ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.modalSaveText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Big picker modal ─────────────────────────────────────────────────────
function BigPickerModal({
  visible, currentBigId, onClose, onSelect,
}: {
  visible: boolean;
  currentBigId?: string | null;
  onClose: () => void;
  onSelect: (userId: string | null) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setResults([]);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const { users } = await getRoster({ q: query, limit: 15 });
        setResults(users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, visible]);

  async function handlePick(userId: string | null) {
    setSaving(true);
    try {
      await onSelect(userId);
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't assign Big", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { maxHeight: "70%" }]}>
          <Text style={styles.modalTitle}>Assign Big</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Search by name or email"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {currentBigId && (
            <Pressable style={styles.modalClearRow} onPress={() => handlePick(null)} disabled={saving}>
              <Text style={styles.modalClearText}>Remove current Big</Text>
            </Pressable>
          )}
          {searching ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(u) => u.id}
              style={{ marginTop: 8 }}
              renderItem={({ item }) => (
                <Pressable style={styles.pickerRow} onPress={() => handlePick(item.id)} disabled={saving}>
                  <Text style={styles.pickerRowName}>{item.firstName} {item.lastName}</Text>
                  <Text style={styles.pickerRowMeta}>{item.email}</Text>
                </Pressable>
              )}
              ListEmptyComponent={query.trim().length > 0 ? <Text style={styles.emptyText}>No matches.</Text> : null}
            />
          )}
          <Pressable style={styles.modalCancelBtn} onPress={onClose} disabled={saving}>
            <Text style={styles.modalCancelText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function MemberProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { userId } = route.params;
  const { isExecOrAbove, isSuperAdmin, can } = usePermissions();

  const [profile, setProfile] = useState<User | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [family, setFamily] = useState<{ big: FamilyMemberSummary | null; littles: FamilyMemberSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleNumberModalVisible, setRoleNumberModalVisible] = useState(false);
  const [bigModalVisible, setBigModalVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, hist, ledger, familyResult] = await Promise.all([
        getMemberProfile(userId),
        getMemberAttendanceHistory(userId),
        getPointsLedger(userId, { limit: 200 }),
        getFamily(userId).catch(() => null),
      ]);
      setProfile(me);
      setHistory(hist.records.slice(0, 8));
      setTotalPoints(ledger.entries.reduce((sum, e) => sum + e.amount, 0));
      setFamily(familyResult);
      navigation.setOptions({ title: `${me.firstName} ${me.lastName}` });
    } catch {
      /* handled by empty state below */
    } finally {
      setLoading(false);
    }
  }, [userId, navigation]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveRoleNumber(value: number | null) {
    await apiSetRoleNumber(userId, value);
    setProfile((p) => (p ? { ...p, roleNumber: value } : p));
  }

  async function handleSelectBig(bigUserId: string | null) {
    await apiSetBig(userId, bigUserId);
    await load();
  }

  async function handleChangeRole() {
    if (!profile) return;
    Alert.alert(
      "Change Role",
      `Current role: ${profile.role}`,
      [
        ...ASSIGNABLE_ROLES.map((role) => ({
          text: role === profile.role ? `${role} (current)` : role,
          onPress: async () => {
            setSaving(true);
            try {
              setProfile(await updateUserFields(userId, { role }));
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not update role");
            } finally {
              setSaving(false);
            }
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }

  async function handleChangeOffice() {
    if (!profile) return;
    Alert.alert(
      "Change Office",
      profile.office ? `Current office: ${officeLabel(profile.office)}` : "No office assigned",
      [
        { text: "None", onPress: async () => {
          setSaving(true);
          try { setProfile(await updateUserFields(userId, { office: null })); }
          catch (e: any) { Alert.alert("Error", e?.message ?? "Could not update office"); }
          finally { setSaving(false); }
        } },
        ...ASSIGNABLE_OFFICES.map((office) => ({
          text: officeLabel(office),
          onPress: async () => {
            setSaving(true);
            try {
              setProfile(await updateUserFields(userId, { office }));
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not update office");
            } finally {
              setSaving(false);
            }
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }

  async function handleChangeStatus() {
    if (!profile) return;
    Alert.alert(
      "Change Status",
      `Current status: ${profile.status}`,
      [
        ...ASSIGNABLE_STATUSES.map((status) => ({
          text: status === profile.status ? `${status} (current)` : status,
          onPress: async () => {
            setSaving(true);
            try {
              setProfile(await updateUserFields(userId, { status }));
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not update status");
            } finally {
              setSaving(false);
            }
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }

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
        <Text style={styles.heroRole}>
          {profile.office ? `${officeLabel(profile.office)} · ` : ""}{profile.role} · {profile.status}
          {profile.roleNumber != null ? ` · #${profile.roleNumber}` : ""}
        </Text>
        {profile.pledgeClassLabel && <Text style={styles.heroMeta}>{profile.pledgeClassLabel}</Text>}
        {(profile.major || profile.graduationYear) && (
          <Text style={styles.heroMeta}>
            {[profile.major, profile.graduationYear ? `Class of ${profile.graduationYear}` : null].filter(Boolean).join(" · ")}
          </Text>
        )}
        <Text style={styles.heroMeta}>{profile.email}</Text>
      </View>

      {(isSuperAdmin || can("membership.assignRoleNumber") || can("membership.manageRelationships")) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manage Member</Text>
          {isSuperAdmin && (
            <>
              <Pressable style={styles.row} onPress={handleChangeRole} disabled={saving}>
                <Text style={styles.rowText}>Role</Text>
                <Text style={styles.rowMeta}>{profile.role} ›</Text>
              </Pressable>
              <Pressable style={styles.row} onPress={handleChangeOffice} disabled={saving}>
                <Text style={styles.rowText}>Office</Text>
                <Text style={styles.rowMeta}>{profile.office ? officeLabel(profile.office) : "None"} ›</Text>
              </Pressable>
              <Pressable style={styles.row} onPress={handleChangeStatus} disabled={saving}>
                <Text style={styles.rowText}>Status</Text>
                <Text style={styles.rowMeta}>{profile.status} ›</Text>
              </Pressable>
            </>
          )}
          {can("membership.assignRoleNumber") && (
            <Pressable
              style={styles.row}
              onPress={() => {
                if (profile.status === "PNM") {
                  Alert.alert("Not initiated yet", "PNMs can't be assigned a role number until their status changes.");
                  return;
                }
                setRoleNumberModalVisible(true);
              }}
            >
              <Text style={styles.rowText}>Role Number</Text>
              <Text style={styles.rowMeta}>{profile.roleNumber != null ? `#${profile.roleNumber}` : "Unassigned"} ›</Text>
            </Pressable>
          )}
          {can("membership.manageRelationships") && (
            <Pressable style={styles.row} onPress={() => setBigModalVisible(true)}>
              <Text style={styles.rowText}>Big</Text>
              <Text style={styles.rowMeta}>
                {family?.big ? `${family.big.firstName} ${family.big.lastName}` : "None"} ›
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Family (Big/Little) — visible to any viewer, same as committees */}
      <Pressable style={styles.card} onPress={() => navigation.navigate("MyFamily", { userId: profile.id })}>
        <Text style={styles.cardLabel}>Family</Text>
        <Text style={styles.familyText}>
          Big: {family?.big ? `${family.big.firstName} ${family.big.lastName}` : "None"} · Littles: {family?.littles.length ?? 0}
        </Text>
      </Pressable>

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

      <RoleNumberModal
        visible={roleNumberModalVisible}
        current={profile.roleNumber}
        onClose={() => setRoleNumberModalVisible(false)}
        onSave={handleSaveRoleNumber}
      />
      <BigPickerModal
        visible={bigModalVisible}
        currentBigId={family?.big?.userId}
        onClose={() => setBigModalVisible(false)}
        onSelect={handleSelectBig}
      />
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
  familyText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 14 },
  modalInput: {
    backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: colors.border, marginTop: 12 },
  modalCancelText: { color: colors.textPrimary, fontWeight: "600" },
  modalClearBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.danger },
  modalClearRow: { paddingVertical: 10, alignItems: "center", marginTop: 10 },
  modalClearText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  modalSaveBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: colors.primary },
  modalSaveText: { color: colors.primaryText, fontWeight: "700" },
  disabledBtn: { opacity: 0.5 },

  pickerRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerRowName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  pickerRowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  adjustBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center", marginBottom: 20 },
  adjustBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary, marginRight: 8 },
  rowMeta: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 20 },
});
