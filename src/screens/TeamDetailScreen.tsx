// src/screens/TeamDetailScreen.tsx
//
// Team roster + total points (Feature 2). Teams are gamification-only
// groupings — NOT committees, no leader/chair concept. A member belongs to
// at most one team; adding them here reassigns them off any previous team.
// Exec+ manages membership; everyone can view.
//
// Integration:
//   - getTeam, addTeamMember, removeTeamMember → api/teams.ts
//   - getRoster → api/users.ts (add-member search, same pattern as
//     CommitteeDetailScreen's AddMemberModal)
//   - usePermissions: isExecOrAbove gates add/remove
//   - Navigation: AppStackParamList → TeamDetail { teamId: string }

import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  Alert, Modal, TextInput, FlatList, RefreshControl,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";
import { usePermissions } from "../hooks/usePermissions";
import { getTeam, addTeamMember, removeTeamMember } from "../api/teams";
import { getRoster } from "../api/users";
import type { Team, TeamMemberSummary, UserSummary } from "../types";
import type { AppStackParamList } from "../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "TeamDetail">;

function AddMemberModal({
  visible, onClose, onAdd, existingIds,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (userId: string) => Promise<void>;
  existingIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Tracks the most recently typed query so a slower, earlier request that
  // resolves after a newer one can detect it's stale and skip overwriting
  // fresher results — the debounce timer only cancels un-fired timers, not
  // requests already in flight.
  const latestQueryRef = useRef("");

  useEffect(() => {
    if (!visible) { setQuery(""); setResults([]); setSelectedUser(null); }
  }, [visible]);

  useEffect(() => {
    latestQueryRef.current = query;
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { users } = await getRoster({ q: query, status: "ACTIVE", limit: 10 });
        if (latestQueryRef.current !== query) return; // superseded by a newer query
        setResults(users.filter((u) => !existingIds.has(u.id)));
      } catch { /**/ }
      finally { if (latestQueryRef.current === query) setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, existingIds]);

  async function handleAdd() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await onAdd(selectedUser.id);
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not add member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Add to Team</Text>
          <Pressable onPress={handleAdd} disabled={!selectedUser || saving}>
            <Text style={[styles.modalDone, (!selectedUser || saving) && styles.modalDoneDisabled]}>
              {saving ? "Adding…" : "Add"}
            </Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search by name…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={(t) => { setQuery(t); setSelectedUser(null); }}
          autoFocus
        />

        {selectedUser ? (
          <View style={styles.selectedUser}>
            <Text style={styles.selectedUserName}>{selectedUser.firstName} {selectedUser.lastName}</Text>
            <Text style={styles.selectedUserHint}>
              Adding a member already on another team moves them here instead.
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => (
              <Pressable style={styles.resultRow} onPress={() => setSelectedUser(item)}>
                <Text style={styles.resultName}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.resultMeta}>{item.email}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              query.length >= 2 ? (
                <Text style={styles.emptyText}>No results</Text>
              ) : (
                <Text style={styles.emptyText}>Type to search members…</Text>
              )
            }
          />
        )}
      </View>
    </Modal>
  );
}

function MemberRow({
  member, canRemove, onRemove, onPress,
}: {
  member: TeamMemberSummary;
  canRemove: boolean;
  onRemove: () => void;
  onPress: () => void;
}) {
  const initials = `${member.firstName[0]}${member.lastName[0]}`.toUpperCase();
  return (
    <Pressable style={styles.memberRow} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.firstName} {member.lastName}</Text>
      </View>
      <Text style={styles.memberPoints}>{member.points} pts</Text>
      {canRemove && (
        <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
          <Text style={styles.removeBtnText}>✕</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export default function TeamDetailScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { teamId } = route.params;
  const { isExecOrAbove } = usePermissions();

  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const t = await getTeam(teamId);
      setTeam(t);
      navigation.setOptions({ title: t.name });
    } catch {
      Alert.alert("Error", "Could not load team");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, navigation]);

  useFocusRefresh(useCallback(({ silent }) => load(!silent), []));

  async function handleAddMember(userId: string) {
    await addTeamMember(teamId, userId);
    await load(false);
  }

  function confirmRemove(member: TeamMemberSummary) {
    Alert.alert(
      "Remove from Team",
      `Remove ${member.firstName} ${member.lastName} from ${team?.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeTeamMember(teamId, member.userId);
              await load(false);
            } catch {
              Alert.alert("Error", "Could not remove member");
            }
          },
        },
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

  if (!team) return null;

  const existingIds = new Set(team.members.map((m) => m.userId));

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={colors.accent} />
        }
      >
        <View style={[styles.headerCard, { borderLeftColor: team.color ?? colors.primary, borderLeftWidth: 5 }]}>
          <Text style={styles.teamName}>{team.name}</Text>
          <View style={styles.headerStatsRow}>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatValue}>{team.totalPoints}</Text>
              <Text style={styles.headerStatLabel}>Total Points</Text>
            </View>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatValue}>{team.memberCount}</Text>
              <Text style={styles.headerStatLabel}>{team.memberCount === 1 ? "Member" : "Members"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Roster</Text>
            {isExecOrAbove && (
              <Pressable onPress={() => setAddModalVisible(true)}>
                <Text style={styles.addMemberText}>+ Add</Text>
              </Pressable>
            )}
          </View>
          {team.members.length === 0 ? (
            <Text style={styles.emptyText}>No members on this team yet</Text>
          ) : (
            team.members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                canRemove={isExecOrAbove}
                onRemove={() => confirmRemove(m)}
                onPress={() => navigation.navigate("MemberProfile", { userId: m.userId })}
              />
            ))
          )}
        </View>
      </ScrollView>

      <AddMemberModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAdd={handleAddMember}
        existingIds={existingIds}
      />
    </>
  );
}

const styles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  teamName: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, marginBottom: 12 },
  headerStatsRow: { flexDirection: "row", gap: 24 },
  headerStat: { alignItems: "flex-start" },
  headerStatValue: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  headerStatLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },

  section: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  addMemberText: { color: colors.accent, fontWeight: "600", fontSize: 14 },
  emptyText: { color: colors.textMuted, textAlign: "center", padding: 20, fontSize: 14 },

  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  memberInfo: { flex: 1 },
  memberName: { color: colors.textPrimary, fontWeight: "500", fontSize: 15 },
  memberPoints: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginRight: 8 },

  removeBtn: { padding: 4 },
  removeBtnText: { color: colors.danger, fontSize: 16, fontWeight: "600" },

  modalContainer: { flex: 1, backgroundColor: colors.background, padding: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingTop: 8 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  modalCancel: { color: colors.textMuted, fontSize: 16 },
  modalDone: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  modalDoneDisabled: { opacity: 0.4 },

  searchInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, fontSize: 15, marginBottom: 12 },
  resultRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultName: { color: colors.textPrimary, fontWeight: "500", fontSize: 15 },
  resultMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  selectedUser: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: colors.accent, marginBottom: 12 },
  selectedUserName: { color: colors.textPrimary, fontWeight: "600", fontSize: 16 },
  selectedUserHint: { color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 17 },
}));
