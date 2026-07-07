// mobile/screens/HomeDashboardScreen.tsx
//
// Integration points:
//   · getDashboard() from api/users.ts — single round-trip for all home data
//   · useNavigation → EventDetail, ChannelMessages, Leaderboard tab
//   · colors.ts — category colors, accent for top-3 rank
//   · DashboardData type from types/index.ts
//   · Pull-to-refresh via RefreshControl

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { getDashboard } from "../api/users";
import { colors } from "../theme/colors";
import type { DashboardData, EventSummary } from "../types";

const CATEGORY_COLOR: Record<string, string> = {
  BROTHERHOOD: colors.categoryBrotherhood,
  SERVICE: colors.categoryService,
  PROFESSIONAL: colors.categoryProfessional,
  RUSH: colors.categoryRush,
  ADMIN: colors.categoryAdmin,
};

const DUES_STATUS_COLOR: Record<string, string> = {
  PAID: colors.success,
  PARTIAL: colors.warning,
  UNPAID: colors.danger,
  WAIVED: colors.textMuted,
};

export default function HomeDashboardScreen() {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      setError(null);
      const d = await getDashboard();
      setData(d);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={colors.primary}
        />
      }
    >
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Pinned announcement */}
      {data?.pinnedAnnouncement && (
        <View style={styles.announcement}>
          <Text style={styles.announcementLabel}>📌 Announcement</Text>
          <Text style={styles.announcementText}>{data.pinnedAnnouncement.content}</Text>
          <Text style={styles.announcementMeta}>
            — {data.pinnedAnnouncement.senderName} · {formatRelative(data.pinnedAnnouncement.createdAt)}
          </Text>
        </View>
      )}

      {/* Points + dues stat cards */}
      <View style={styles.statsRow}>
        <Pressable
          style={styles.statCard}
          onPress={() => navigation.navigate("Leaderboard")}
        >
          <Text style={styles.statValue}>{data?.points.total ?? 0}</Text>
          <Text style={styles.statLabel}>points</Text>
          {data?.points.rank && (
            <Text style={styles.statSub}>#{data.points.rank} this semester</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.statCard}
          onPress={() => navigation.navigate("Profile")}
        >
          {data?.duesRecord ? (
            <>
              <Text
                style={[styles.statValue, { color: DUES_STATUS_COLOR[data.duesRecord.status] }]}
              >
                {data.duesRecord.status}
              </Text>
              <Text style={styles.statLabel}>dues</Text>
              <Text style={styles.statSub}>
                ${data.duesRecord.amountPaid} / ${data.duesRecord.amountOwed}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.statValue}>—</Text>
              <Text style={styles.statLabel}>dues</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Upcoming events */}
      <Text style={styles.sectionHeader}>Upcoming This Week</Text>
      {!data?.upcomingEvents.length ? (
        <Text style={styles.empty}>No events in the next 7 days.</Text>
      ) : (
        data.upcomingEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onPress={() => navigation.navigate("EventDetail", { eventId: event.id })}
          />
        ))
      )}
    </ScrollView>
  );
}

function EventCard({ event, onPress }: { event: EventSummary; onPress: () => void }) {
  const isRequired = event.attendanceRequired;
  const catColor = CATEGORY_COLOR[event.category] ?? colors.categoryAdmin;

  return (
    <Pressable style={styles.eventCard} onPress={onPress}>
      <View style={[styles.eventCategoryBar, { backgroundColor: catColor }]} />
      <View style={styles.eventBody}>
        <View style={styles.eventHeaderRow}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          <View style={styles.eventBadges}>
            {isRequired && (
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredBadgeText}>Required</Text>
              </View>
            )}
            {event.pointValue > 0 && (
              <View style={styles.pointsBadge}>
                <Text style={styles.pointsBadgeText}>+{event.pointValue}pts</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.eventTime}>{formatEventTime(event.startTime)}</Text>
        {event.location && (
          <Text style={styles.eventLocation} numberOfLines={1}>📍 {event.location}</Text>
        )}
        {event.myRsvpStatus && (
          <Text style={styles.eventRsvp}>RSVP: {event.myRsvpStatus}</Text>
        )}
      </View>
    </Pressable>
  );
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  error: { color: colors.danger, fontSize: 13, marginBottom: 12, textAlign: "center" },

  announcement: {
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  announcementLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  announcementText: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  announcementMeta: { fontSize: 12, color: colors.textMuted, marginTop: 6 },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: colors.surface,
    borderRadius: 12, padding: 16, alignItems: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  statValue: { fontSize: 26, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  statSub: { fontSize: 11, color: colors.textMuted, marginTop: 4 },

  sectionHeader: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  empty: { fontSize: 15, color: colors.textMuted, textAlign: "center", marginTop: 16 },

  eventCard: {
    flexDirection: "row", backgroundColor: colors.surface,
    borderRadius: 12, marginBottom: 10, overflow: "hidden",
    borderWidth: 1, borderColor: colors.border,
  },
  eventCategoryBar: { width: 5 },
  eventBody: { flex: 1, padding: 12 },
  eventHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  eventTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  eventBadges: { flexDirection: "row", gap: 4 },
  requiredBadge: { backgroundColor: colors.danger, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  requiredBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  pointsBadge: { backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  pointsBadgeText: { color: colors.primary, fontSize: 10, fontWeight: "700" },
  eventTime: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  eventLocation: { fontSize: 13, color: colors.textSecondary },
  eventRsvp: { fontSize: 12, color: colors.primary, marginTop: 4, fontWeight: "600" },
});
