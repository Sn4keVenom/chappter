// src/screens/MapViewScreen.tsx
//
// Reached from EventDetailScreen's location line. No map library
// (react-native-maps / expo-maps) is installed — adding one is a real
// native-dependency decision, not something to slip in as a side effect of
// wiring up this one screen. Shows the location text/coordinates cleanly
// instead of the previous blank `() => null` stub.
//
// Integration: Navigation → AppStackParamList → MapView { event }

import React from "react";
import { View, Text, StyleSheet, Linking, Pressable } from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { colors } from "../theme/colors";
import type { AppStackParamList } from "../navigation/types";

type RoutePropType = RouteProp<AppStackParamList, "MapView">;

export default function MapViewScreen() {
  const route = useRoute<RoutePropType>();
  const { event } = route.params;
  const hasCoords = event.latitude != null && event.longitude != null;

  const openInMaps = () => {
    const query = hasCoords
      ? `${event.latitude},${event.longitude}`
      : encodeURIComponent(event.location);
    Linking.openURL(`https://maps.apple.com/?q=${query}`).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.icon}>📍</Text>
      <Text style={styles.location}>{event.location}</Text>
      {hasCoords && (
        <Text style={styles.coords}>{event.latitude!.toFixed(5)}, {event.longitude!.toFixed(5)}</Text>
      )}
      <Text style={styles.note}>
        An embedded map isn't wired up yet (no map SDK is installed). Open this address in your
        phone's maps app instead.
      </Text>
      <Pressable style={styles.button} onPress={openInMaps}>
        <Text style={styles.buttonText}>Open in Maps</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 },
  icon: { fontSize: 40, marginBottom: 12 },
  location: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  coords: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  note: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginTop: 16, marginBottom: 20 },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 13 },
  buttonText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
});
