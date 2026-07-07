// mobile/src/screens/EventDetailScreen.tsx
//
// Demonstrates: typed API client usage, Zustand for local UI state,
// permission-conditional rendering (officer tools only render for
// Officer+ AND only when this user is scoped to this event's committee),
// and the RSVP vs. Attendance distinction called out in the product spec
// (RSVPing never implies points — only a confirmed check-in does).

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { usePermissions } from "../hooks/usePermissions";
import { useAuthStore } from "../store/useAuthStore";
import { getEvent, setRsvp, type EventDetail, type RsvpStatus } from "../api/events";

const CATEGORY_COLOR: Record<string, string> = {
  BROTHERHOOD: colors.categoryBrotherhood,
  SERVICE: colors.categoryService,
  PROFESSIONAL: colors.categoryProfessional,
  RUSH: colors.categoryRush,
  ADMIN: colors.categoryAdmin,
};

const RSVP_OPTIONS: { label: string; value: RsvpStatus }[] = [
  { label: "Going", value: "GOING" },
  { label: "Maybe", value: "MAYBE" },
  { label: "Not going", value: "NOT_GOING" },
];

export default function EventDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { eventId } = route.params as { eventId: string };

  const currentUser = useAuthStore((s) => s.user);
  const { canManageEvent } = usePermissions();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    try {
      setError(null);
      const data = await getEvent(eventId);
      setEvent(data);
    } catch (e) {
      setError("Couldn't load this event. Pull down to try again.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  const handleRsvp = async (status: RsvpStatus) => {
    if (!event) return;
    setRsvpSaving(true);
    const previous = event.myRsvpStatus;
    setEvent({ ...event, myRsvpStatus: status }); // optimistic
    try {
      await setRsvp(event.id, status);
    } catch (e) {
      setEvent({ ...event, myRsvpStatus: previous }); // revert on failure
      setError("Couldn't save your RSVP — check your connection and try again.");
    } finally {
      setRsvpSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? "Event not found."}</Text>
      </View>
    );
  }

  const isOfficerForThisEvent = canManageEvent(event);
  const isPastEvent = new Date(event.endTime) < new Date();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View
          style={[
            styles.categoryTag,
            { backgroundColor: CATEGORY_COLOR[event.category] ?? colors.categoryAdmin },
          ]}
        >
          <Text style={styles.categoryTagText}>{event.category}</Text>
        </View>
        {event.attendanceRequired && (
          <View style={styles.requiredTag}>
            <Text style={styles.requiredTagText}>Required</Text>
          </View>
        )}
      </View>

      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.dateTime}>{formatDateRange(event.startTime, event.endTime)}</Text>
      {event.location ? (
        <Pressable onPress={() => navigation.navigate("MapView", { event })}>
          <Text style={styles.location}>📍 {event.location}</Text>
        </Pressable>
      ) : null}

      {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {/* Member RSVP — disabled once the event has ended */}
      {!isPastEvent && (
        <View style={styles.rsvpSection}>
          <Text style={styles.sectionLabel}>Your RSVP</Text>
          <View style={styles.rsvpRow}>
            {RSVP_OPTIONS.map((opt) => {
              const selected = event.myRsvpStatus === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  disabled={rsvpSaving}
                  onPress={() => handleRsvp(opt.value)}
                  style={[styles.rsvpButton, selected && styles.rsvpButtonSelected]}
                >
                  <Text style={[styles.rsvpButtonText, selected && styles.rsvpButtonTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.rsvpHint}>
            RSVPing holds your spot — points are only earned by checking in at the event.
          </Text>
        </View>
      )}

      {/* Member's own post-event result */}
      {isPastEvent && event.myAttendance && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>
            {event.myAttendance.late ? "Checked in (late)" : "Checked in"}
          </Text>
          <Text style={styles.resultPoints}>+{event.myAttendance.pointsAwarded} points</Text>
        </View>
      )}
      {isPastEvent && !event.myAttendance && (
        <View style={[styles.resultCard, styles.resultCardMissed]}>
          <Text style={styles.resultTitleMissed}>Not marked present</Text>
        </View>
      )}

      {/* Officer / Exec tools — scoped to this event's committee, server-enforced regardless */}
      {isOfficerForThisEvent && (
        <View style={styles.officerSection}>
          <Text style={styles.sectionLabel}>Manage</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => navigation.navigate("CheckIn", { eventId: event.id, mode: "officer" })}
          >
            <Text style={styles.primaryButtonText}>Open Check-In ({event.checkedInCount} checked in)</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("AttendanceOverride", { eventId: event.id })}
          >
            <Text style={styles.secondaryButtonText}>Manage attendance →</Text>
          </Pressable>
        </View>
      )}

      {/* Member self check-in — shown when:
            · the event is currently active (not past)
            · the member hasn't already checked in
            · the check-in window is open (or no window is set)
          The server enforces all of these; we just surface the button.
          Only non-officers see this — officers use the Manage section above. */}
      {!isPastEvent && !event.myAttendance && !isOfficerForThisEvent && (
        <View style={styles.officerSection}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => navigation.navigate("CheckIn", { eventId: event.id, mode: "member" })}
          >
            <Text style={styles.primaryButtonText}>Check In</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const dateStr = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const startTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateStr} · ${startTime} – ${endTime}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  errorText: { color: colors.textSecondary, fontSize: 15 },
  errorBanner: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  headerRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  categoryTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  categoryTagText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  requiredTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.danger },
  requiredTagText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, marginBottom: 6 },
  dateTime: { fontSize: 15, color: colors.textSecondary, marginBottom: 2 },
  location: { fontSize: 15, color: colors.primary, marginBottom: 14, textDecorationLine: "underline" },
  description: { fontSize: 15, lineHeight: 22, color: colors.textPrimary, marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  rsvpSection: { marginBottom: 28 },
  rsvpRow: { flexDirection: "row", gap: 8 },
  rsvpButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  rsvpButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  rsvpButtonText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  rsvpButtonTextSelected: { color: colors.primaryText },
  rsvpHint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  resultCard: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#EAF6EF",
    marginBottom: 24,
  },
  resultCardMissed: { backgroundColor: "#FBEDEC" },
  resultTitle: { fontSize: 15, fontWeight: "700", color: colors.success },
  resultTitleMissed: { fontSize: 15, fontWeight: "700", color: colors.danger },
  resultPoints: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  officerSection: { marginTop: 8, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
  primaryButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8, alignItems: "center", marginBottom: 10 },
  primaryButtonText: { color: colors.primaryText, fontSize: 15, fontWeight: "700" },
  secondaryButton: { paddingVertical: 8, alignItems: "center" },
  secondaryButtonText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
});
