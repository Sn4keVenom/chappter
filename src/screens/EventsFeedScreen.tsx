// src/screens/EventsFeedScreen.tsx
//
// Integration points:
//   · useEventsStore — fetchEvents on focus, events state
//   · usePermissions — isOfficerOrAbove gates FAB to create events
//   · navigation → EventDetail, CreateEvent
//   · colors.ts — category filter chip colors

import React, { useCallback, useState } from "react";
import {
  View, Text, FlatList, Pressable,
  ActivityIndicator, Switch, RefreshControl
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import { useEventsStore } from "../store/useEventsStore";
import { usePermissions } from "../hooks/usePermissions";
import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";
import { eventCategoryColor } from "../theme/semantic";
import type { EventSummary, EventCategory } from "../types";

const CATEGORIES: EventCategory[] = ["BROTHERHOOD", "SERVICE", "PROFESSIONAL", "RUSH", "ADMIN"];


export default function EventsFeedScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<any>();
  const { events, loading, error, fetchEvents } = useEventsStore();
  const { isOfficerOrAbove } = usePermissions();

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [activeCategory, setActiveCategory] = useState<EventCategory | null>(null);
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const now = new Date().toISOString();
    await fetchEvents({
      ...(tab === "upcoming" ? { from: now } : { to: now }),
      ...(activeCategory ? { category: activeCategory } : {}),
    });
    if (isRefresh) setRefreshing(false);
  }, [tab, activeCategory, fetchEvents]);

  // The events list renders from the store, which keeps its previous contents
  // while a refetch is in flight — so refocusing never blanks the feed, and
  // the pull-to-refresh spinner is reserved for an explicit pull.
  useFocusRefresh(useCallback(() => load(false), [load]));

  const filtered = events.filter((e) => {
    const isPast = new Date(e.endTime) < new Date();
    if (tab === "upcoming" && isPast) return false;
    if (tab === "past" && !isPast) return false;
    if (requiredOnly && !e.attendanceRequired) return false;
    return true;
  });

  return (
    <View style={styles.screen}>
      {/* Tab toggle */}
      <View style={styles.tabRow}>
        {(["upcoming", "past"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "upcoming" ? "Upcoming" : "Past"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Category filter chips */}
      <View style={styles.chipRow}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setActiveCategory(activeCategory === cat ? null : cat)}
            style={[
              styles.chip,
              activeCategory === cat && { backgroundColor: eventCategoryColor(cat) },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                activeCategory === cat && { color: "#fff" },
              ]}
            >
              {cat.charAt(0) + cat.slice(1).toLowerCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Required toggle */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Required only</Text>
        <Switch
          value={requiredOnly}
          onValueChange={setRequiredOnly}
          trackColor={{ true: colors.primary }}
          thumbColor={colors.surface}
        />
      </View>

      {error && !loading && <Text style={styles.errorBanner}>{error}</Text>}

      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {tab === "upcoming" ? "No upcoming events" : "No past events"}.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.eventCard}
              onPress={() => navigation.navigate("EventDetail", { eventId: item.id })}
            >
              <View
                style={[
                  styles.categoryBar,
                  { backgroundColor: eventCategoryColor(item.category) },
                ]}
              />
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={styles.badges}>
                    {item.attendanceRequired && (
                      <View style={styles.reqBadge}>
                        <Text style={styles.reqBadgeText}>Required</Text>
                      </View>
                    )}
                    {item.pointValue > 0 && (
                      <Text style={styles.ptsBadge}>+{item.pointValue}pts</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.eventTime}>{formatEventTime(item.startTime, item.endTime)}</Text>
                {item.location && (
                  <Text style={styles.eventLocation} numberOfLines={1}>📍 {item.location}</Text>
                )}
                {item.committee && (
                  <Text style={styles.committee}>{item.committee.name}</Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      {/* FAB — Officer+ only */}
      {isOfficerOrAbove && (
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate("CreateEvent")}
        >
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}
    </View>
  );
}

function formatEventTime(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const date = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const st = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const et = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${st}–${et}`;
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  tabRow: { flexDirection: "row", margin: 16, marginBottom: 0, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  tabTextActive: { color: colors.primaryText },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  filterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterLabel: { fontSize: 14, color: colors.textSecondary },
  errorBanner: { color: colors.danger, fontSize: 13, textAlign: "center", paddingHorizontal: 16, paddingTop: 10 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 10, paddingBottom: 48 },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 15, color: colors.textMuted },
  eventCard: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  categoryBar: { width: 5 },
  cardBody: { flex: 1, padding: 12 },
  cardHeader: { flexDirection: "row", gap: 8, marginBottom: 4, alignItems: "flex-start" },
  eventTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  badges: { flexDirection: "row", gap: 4 },
  reqBadge: { backgroundColor: colors.danger, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  reqBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  ptsBadge: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  eventTime: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  eventLocation: { fontSize: 12, color: colors.textSecondary },
  committee: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  fab: {
    position: "absolute", bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  fabText: { fontSize: 28, color: colors.primaryText, lineHeight: 32 },
}));
