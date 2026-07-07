// mobile/screens/admin/AttendanceOverrideScreen.tsx
//
// Manual attendance management for a specific event. Officer+ can view the
// full roster (RSVP status + attendance status), mark absent members as
// present, or remove a mistaken check-in with an audit reason.
//
// Integration:
//   - getEventRoster, manualMarkAttendance from api/attendance.ts
//   - usePermissions: isOfficerOrAbove guard (also enforced server-side)
//   - Navigation: AppStackParamList → AttendanceOverride { eventId: string }
//   - Reachable from EventDetailScreen via "Attendance" button (Officer+ only)

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  SectionList,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../../theme/colors";
import { usePermissions } from "../../hooks/usePermissions";
import { getEventRoster, manualMarkAttendance } from "../../api/attendance";
import type { RosterEntry, RsvpStatus } from "../../types";
import type { AppStackParamList } from "../../navigation/types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;
type RoutePropType = RouteProp<AppStackParamList, "AttendanceOverride">;

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: color + "22" }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function RsvpChip({ status }: { status: RsvpStatus | null }) {
  if (!status) return null;
  const map: Record<RsvpStatus, { label: string; color: string }> = {
    GOING: { label: "Going", color: colors.success },
    MAYBE: { label: "Maybe", color: colors.warning },
    NOT_GOING: { label: "Not going", color: colors.textMuted },
  };
  const { label, color } = map[status];
  return <StatusChip label={label} color={color} />;
}

// ─── Override reason modal ────────────────────────────────────────────────────

function ReasonModal({
  visible,
  action,
  memberName,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  action: "mark_present" | "remove";
  memberName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!visible) setReason("");
  }, [visible]);

  const title = action === "mark_present" ? "Mark Present" : "Remove Attendance";
  const placeholder =
    action === "mark_present"
      ? "Reason for manual check-in…"
      : "Reason for removing attendance…";
  const btnLabel = action === "mark_present" ? "Mark Present" : "Remove";
  const btnColor = action === "mark_present" ? colors.success : colors.danger;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.reasonCard}>
          <Text style={styles.reasonTitle}>{title}</Text>
          <Text style={styles.reasonMember}>{memberName}</Text>

          <TextInput
            style={styles.reasonInput}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            autoFocus
          />

          <View style={styles.reasonActions}>
            <Pressable style={styles.reasonCancel} onPress={onCancel}>
              <Text style={styles.reasonCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.reasonConfirm, { backgroundColor: btnColor }, !reason.trim() && styles.disabledBtn]}
              onPress={() => reason.trim() && onConfirm(reason.trim())}
            >
              <Text style={styles.reasonConfirmText}>{btnLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Roster entry row ─────────────────────────────────────────────────────────

function RosterRow({
  entry,
  onMarkPresent,
  onRemove,
}: {
  entry: RosterEntry;
  onMarkPresent: () => void;
  onRemove: () => void;
}) {
  const attended = !!entry.attendance;
  const initials = `${entry.firstName[0]}${entry.lastName[0]}`.toUpperCase();

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.avatar, attended && styles.avatarAttended]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>
            {entry.firstName} {entry.lastName}
          </Text>
          <View style={styles.rowMeta}>
            <RsvpChip status={entry.rsvpStatus} />
            {attended && (
              <StatusChip
                label={entry.attendance!.late ? "Late" : "Present"}
                color={entry.attendance!.late ? colors.warning : colors.success}
              />
            )}
            {attended && (
              <Text style={styles.rowPoints}>+{entry.attendance!.pointsAwarded} pts</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.rowActions}>
        {!attended ? (
          <Pressable style={[styles.actionBtn, styles.actionBtnPresent]} onPress={onMarkPresent}>
            <Text style={styles.actionBtnText}>✓ Mark</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.actionBtn, styles.actionBtnRemove]} onPress={onRemove}>
            <Text style={[styles.actionBtnText, styles.actionBtnRemoveText]}>✕ Remove</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type PendingAction = {
  entry: RosterEntry;
  action: "mark_present" | "remove";
} | null;

export default function AttendanceOverrideScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { eventId } = route.params;
  const { isOfficerOrAbove } = usePermissions();

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [eventInfo, setEventInfo] = useState<{ title: string; pointValue: number } | null>(null);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // userId currently saving
  const [pending, setPending] = useState<PendingAction>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { roster: r, checkedInCount: c, event } = await getEventRoster(eventId);
      setRoster(r);
      setCheckedInCount(c);
      setEventInfo(event);
      navigation.setOptions({ title: event.title });
    } catch {
      Alert.alert("Error", "Could not load roster");
    } finally {
      setLoading(false);
    }
  }, [eventId, navigation]);

  useEffect(() => { load(); }, [load]);

  // Guard — should never be reachable if AppNavigator gates it, but defensive.
  if (!isOfficerOrAbove) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permError}>Officer access required</Text>
      </View>
    );
  }

  async function handleConfirm(reason: string) {
    if (!pending) return;
    const { entry, action } = pending;
    setPending(null);
    setSaving(entry.userId);
    try {
      await manualMarkAttendance(eventId, entry.userId, {
        action,
        overrideReason: reason,
        late: false,
      });
      // Reload roster to get server-computed points and fresh state
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update attendance");
    } finally {
      setSaving(null);
    }
  }

  // Section split: checked-in vs not
  const query = searchQuery.toLowerCase();
  const filtered = roster.filter(
    (r) =>
      !query ||
      r.firstName.toLowerCase().includes(query) ||
      r.lastName.toLowerCase().includes(query) ||
      r.email.toLowerCase().includes(query)
  );

  const checkedIn = filtered.filter((r) => !!r.attendance);
  const notCheckedIn = filtered.filter((r) => !r.attendance);

  const sections = [
    { title: `Checked In (${checkedIn.length})`, data: checkedIn },
    { title: `Not Checked In (${notCheckedIn.length})`, data: notCheckedIn },
  ].filter((s) => s.data.length > 0);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{checkedInCount}</Text>
          <Text style={styles.statLabel}>Checked In</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{roster.length - checkedInCount}</Text>
          <Text style={styles.statLabel}>Absent</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{roster.length}</Text>
          <Text style={styles.statLabel}>Total RSVP</Text>
        </View>
        {eventInfo && (
          <>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{eventInfo.pointValue}</Text>
              <Text style={styles.statLabel}>Points</Text>
            </View>
          </>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name…"
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.userId}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          saving === item.userId ? (
            <View style={[styles.row, styles.rowSaving]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.savingText}>Updating…</Text>
            </View>
          ) : (
            <RosterRow
              entry={item}
              onMarkPresent={() => setPending({ entry: item, action: "mark_present" })}
              onRemove={() => setPending({ entry: item, action: "remove" })}
            />
          )
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {searchQuery ? "No members match your search" : "No attendance records yet"}
          </Text>
        }
        stickySectionHeadersEnabled
      />

      <ReasonModal
        visible={!!pending}
        action={pending?.action ?? "mark_present"}
        memberName={
          pending ? `${pending.entry.firstName} ${pending.entry.lastName}` : ""
        }
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  permError: { color: colors.danger, fontSize: 16 },

  // Stats bar
  statsBar: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.primaryText, fontSize: 20, fontWeight: "700" },
  statLabel: { color: colors.primaryText + "99", fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.primaryText + "33" },

  // Search
  searchBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: 10,
  },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // List
  listContent: { paddingBottom: 40 },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    padding: 40,
    fontSize: 15,
  },

  // Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowSaving: { gap: 12, paddingVertical: 16 },
  savingText: { color: colors.textMuted, fontSize: 14 },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarAttended: { backgroundColor: colors.primary },
  avatarText: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },
  rowInfo: { flex: 1 },
  rowName: { color: colors.textPrimary, fontWeight: "500", fontSize: 15 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  rowPoints: { color: colors.textMuted, fontSize: 12 },
  rowActions: {},

  // Chips
  chip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: "600" },

  // Action buttons
  actionBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 72,
    alignItems: "center",
  },
  actionBtnPresent: { backgroundColor: colors.success + "22", borderWidth: 1, borderColor: colors.success },
  actionBtnRemove: { backgroundColor: colors.danger + "11", borderWidth: 1, borderColor: colors.danger },
  actionBtnText: { fontSize: 13, fontWeight: "600", color: colors.success },
  actionBtnRemoveText: { color: colors.danger },
  disabledBtn: { opacity: 0.4 },

  // Reason modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  reasonCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
  },
  reasonTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  reasonMember: { fontSize: 15, color: colors.textSecondary, marginBottom: 16 },
  reasonInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 80,
    marginBottom: 16,
  },
  reasonActions: { flexDirection: "row", gap: 10 },
  reasonCancel: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.border,
  },
  reasonCancelText: { color: colors.textPrimary, fontWeight: "600" },
  reasonConfirm: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  reasonConfirmText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
