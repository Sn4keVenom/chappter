// src/screens/CommitteeDetailScreen.tsx
//
// Committee detail view. Accessible by any member via navigation.
// Chair and Exec+ see management affordances (edit description, add/remove members).
//
// Integration:
//   - getCommittee, updateCommittee, addCommitteeMember, removeCommitteeMember
//     from api/committees.ts
//   - getRoster from api/users.ts — for the add-member picker
//   - usePermissions: isExecOrAbove, role and user.committeeChairOf for chair check
//   - useAuthStore: current user id
//   - Navigation: AppStackParamList → CommitteeDetail { committeeId: string }
//   - Navigates to: ChannelMessages (if channelId available), MemberProfile

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  FlatList,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../theme/colors";
import { useAuthStore } from "../store/useAuthStore";
import { usePermissions } from "../hooks/usePermissions";
import {
  getCommittee,
  updateCommittee,
  addCommitteeMember,
  removeCommitteeMember,
} from "../api/committees";
import { getRoster } from "../api/users";
import { getCommitteeBudget } from "../api/finance";
import { formatCurrency } from "../types";
import type { Committee, CommitteeMemberSummary, UserSummary, CommitteeRole, CommitteeBudget } from "../types";
import type { AppStackParamList } from "../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "CommitteeDetail">;

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: CommitteeRole }) {
  return (
    <View style={[styles.badge, role === "CHAIR" ? styles.badgeChair : styles.badgeMember]}>
      <Text style={styles.badgeText}>{role}</Text>
    </View>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({
  member,
  canRemove,
  onRemove,
  onPress,
}: {
  member: CommitteeMemberSummary;
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
        <Text style={styles.memberName}>
          {member.firstName} {member.lastName}
        </Text>
        <RoleBadge role={member.role} />
      </View>
      {canRemove && (
        <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
          <Text style={styles.removeBtnText}>✕</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

// ─── Add member modal ─────────────────────────────────────────────────────────

function AddMemberModal({
  visible,
  onClose,
  onAdd,
  existingIds,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (userId: string, role: CommitteeRole) => Promise<void>;
  existingIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [role, setRole] = useState<CommitteeRole>("MEMBER");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSelectedUser(null);
      setRole("MEMBER");
    }
  }, [visible]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { users } = await getRoster({ q: query, status: "ACTIVE", limit: 10 });
        setResults(users.filter((u) => !existingIds.has(u.id)));
      } catch { /**/ }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, existingIds]);

  async function handleAdd() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await onAdd(selectedUser.id, role);
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
          <Text style={styles.modalTitle}>Add Member</Text>
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
            <Text style={styles.selectedUserName}>
              {selectedUser.firstName} {selectedUser.lastName}
            </Text>
            <View style={styles.roleToggle}>
              {(["MEMBER", "CHAIR"] as CommitteeRole[]).map((r) => (
                <Pressable
                  key={r}
                  style={[styles.roleToggleBtn, role === r && styles.roleToggleBtnActive]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.roleToggleText, role === r && styles.roleToggleTextActive]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => (
              <Pressable style={styles.resultRow} onPress={() => setSelectedUser(item)}>
                <Text style={styles.resultName}>
                  {item.firstName} {item.lastName}
                </Text>
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

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: { name: string; description: string };
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [desc, setDesc] = useState(initial.description);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setName(initial.name); setDesc(initial.description); }
  }, [visible, initial.name, initial.description]);

  async function handleSave() {
    if (!name.trim()) { Alert.alert("Name required"); return; }
    setSaving(true);
    try {
      await onSave(name.trim(), desc.trim());
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save");
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
          <Text style={styles.modalTitle}>Edit Committee</Text>
          <Pressable onPress={handleSave} disabled={saving}>
            <Text style={[styles.modalDone, saving && styles.modalDoneDisabled]}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.field}
          value={name}
          onChangeText={setName}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          style={[styles.field, styles.fieldMultiline]}
          value={desc}
          onChangeText={setDesc}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          placeholderTextColor={colors.textMuted}
        />
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CommitteeDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { committeeId } = route.params;

  const currentUser = useAuthStore((s) => s.user);
  const { isExecOrAbove, isOfficerOrAbove } = usePermissions();

  const [committee, setCommittee] = useState<Committee | null>(null);
  const [budget, setBudget] = useState<CommitteeBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const isChair = !!currentUser && (committee?.members ?? []).some(
    (m) => m.userId === currentUser.id && m.role === "CHAIR"
  );
  const canManage = isExecOrAbove || isChair;

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const c = await getCommittee(committeeId);
      setCommittee(c);
      navigation.setOptions({ title: c.name });
    } catch {
      Alert.alert("Error", "Could not load committee");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [committeeId, navigation]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Budget visibility (Feature 5) mirrors the mock's own authorization —
  // Treasurer/Exec+ always, the committee's own chair too. Fetched
  // separately since a regular member's 403 here shouldn't block the rest
  // of the screen from loading.
  useEffect(() => {
    if (!canManage) { setBudget(null); return; }
    getCommitteeBudget(committeeId).then(setBudget).catch(() => setBudget(null));
  }, [committeeId, canManage]);

  async function handleSaveEdit(name: string, description: string) {
    const updated = await updateCommittee(committeeId, { name, description });
    setCommittee(updated);
    navigation.setOptions({ title: updated.name });
  }

  async function handleAddMember(userId: string, role: CommitteeRole) {
    await addCommitteeMember(committeeId, { userId, role });
    await load(false);
  }

  function confirmRemove(member: CommitteeMemberSummary) {
    Alert.alert(
      "Remove Member",
      `Remove ${member.firstName} ${member.lastName} from this committee?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeCommitteeMember(committeeId, member.userId);
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

  if (!committee) return null;

  const existingIds = new Set(committee.members.map((m) => m.userId));
  const chairs = committee.members.filter((m) => m.role === "CHAIR");
  const members = committee.members.filter((m) => m.role === "MEMBER");

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(false); }}
            tintColor={colors.accent}
          />
        }
      >
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.committeeName}>{committee.name}</Text>
            {canManage && (
              <Pressable onPress={() => setEditModalVisible(true)} style={styles.editBtn}>
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            )}
          </View>
          {committee.description ? (
            <Text style={styles.description}>{committee.description}</Text>
          ) : (
            <Text style={styles.descriptionEmpty}>No description</Text>
          )}
          <Text style={styles.memberCount}>
            {committee.memberCount} {committee.memberCount === 1 ? "member" : "members"}
          </Text>
        </View>

        {/* Channel button */}
        {committee.channelId && isOfficerOrAbove && (
          <Pressable
            style={styles.channelBtn}
            onPress={() =>
              navigation.navigate("ChannelMessages", {
                channelId: committee.channelId!,
                channelName: `#${committee.name}`,
              })
            }
          >
            <Text style={styles.channelBtnText}>✉  Open Committee Channel</Text>
          </Pressable>
        )}

        {/* Budget summary + expense submission (Feature 5) — Treasurer/Exec+
            and this committee's own chair only */}
        {budget && (
          <View style={styles.budgetCard}>
            <Text style={styles.budgetLabel}>Budget this semester</Text>
            <View style={styles.budgetStatsRow}>
              <View style={styles.budgetStat}>
                <Text style={styles.budgetStatValue}>{formatCurrency(budget.remaining)}</Text>
                <Text style={styles.budgetStatLabel}>Remaining</Text>
              </View>
              <View style={styles.budgetStat}>
                <Text style={styles.budgetStatValue}>{formatCurrency(budget.allocated)}</Text>
                <Text style={styles.budgetStatLabel}>Allocated</Text>
              </View>
            </View>
            {isChair && (
              <Pressable
                style={styles.submitExpenseBtn}
                onPress={() => navigation.navigate("SubmitExpense", { committeeId, committeeName: committee.name })}
              >
                <Text style={styles.submitExpenseBtnText}>Submit Expense</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Chairs section */}
        {chairs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chairs</Text>
            {chairs.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                canRemove={canManage && m.userId !== currentUser?.id}
                onRemove={() => confirmRemove(m)}
                onPress={() => navigation.navigate("MemberProfile", { userId: m.userId })}
              />
            ))}
          </View>
        )}

        {/* Members section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Members</Text>
            {canManage && (
              <Pressable onPress={() => setAddModalVisible(true)}>
                <Text style={styles.addMemberText}>+ Add</Text>
              </Pressable>
            )}
          </View>
          {members.length === 0 ? (
            <Text style={styles.emptyText}>No members yet</Text>
          ) : (
            members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                canRemove={canManage}
                onRemove={() => confirmRemove(m)}
                onPress={() => navigation.navigate("MemberProfile", { userId: m.userId })}
              />
            ))
          )}
        </View>
      </ScrollView>

      <EditModal
        visible={editModalVisible}
        initial={{
          name: committee.name,
          description: committee.description ?? "",
        }}
        onClose={() => setEditModalVisible(false)}
        onSave={handleSaveEdit}
      />

      <AddMemberModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAdd={handleAddMember}
        existingIds={existingIds}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header card
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  committeeName: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  editBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  editBtnText: { color: colors.primaryText, fontSize: 13, fontWeight: "600" },
  description: { color: colors.textSecondary, marginTop: 8, fontSize: 14, lineHeight: 20 },
  descriptionEmpty: { color: colors.textMuted, marginTop: 8, fontSize: 14, fontStyle: "italic" },
  memberCount: { color: colors.textMuted, fontSize: 13, marginTop: 10 },

  // Channel button
  channelBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  channelBtnText: { color: colors.primaryText, fontWeight: "600", fontSize: 15 },

  // Budget card (Feature 5)
  budgetCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  budgetLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  budgetStatsRow: { flexDirection: "row", gap: 24, marginBottom: 12 },
  budgetStat: { alignItems: "flex-start" },
  budgetStatValue: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  budgetStatLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },
  submitExpenseBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  submitExpenseBtnText: { color: colors.primary, fontWeight: "700", fontSize: 13 },

  // Sections
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  addMemberText: { color: colors.accent, fontWeight: "600", fontSize: 14 },
  emptyText: { color: colors.textMuted, textAlign: "center", padding: 20, fontSize: 14 },

  // Member row
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  memberInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { color: colors.textPrimary, fontWeight: "500", fontSize: 15 },

  // Badge
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeChair: { backgroundColor: colors.accent + "22" },
  badgeMember: { backgroundColor: colors.border },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" },

  // Remove button
  removeBtn: { padding: 4 },
  removeBtnText: { color: colors.danger, fontSize: 16, fontWeight: "600" },

  // Modal shared
  modalContainer: { flex: 1, backgroundColor: colors.background, padding: 16 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingTop: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  modalCancel: { color: colors.textMuted, fontSize: 16 },
  modalDone: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  modalDoneDisabled: { opacity: 0.4 },

  // Edit modal fields
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", marginBottom: 6, marginTop: 16 },
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 15,
  },
  fieldMultiline: { minHeight: 100 },

  // Add member modal
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 12,
  },
  resultRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultName: { color: colors.textPrimary, fontWeight: "500", fontSize: 15 },
  resultMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  selectedUser: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: 12,
  },
  selectedUserName: { color: colors.textPrimary, fontWeight: "600", fontSize: 16, marginBottom: 12 },
  roleToggle: { flexDirection: "row", gap: 10 },
  roleToggleBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.border,
  },
  roleToggleBtnActive: { backgroundColor: colors.primary },
  roleToggleText: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
  roleToggleTextActive: { color: colors.primaryText },
});
