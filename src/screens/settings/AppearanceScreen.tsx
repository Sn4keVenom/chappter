// src/screens/settings/AppearanceScreen.tsx
//
// The user's PERSONAL appearance preference — System / Light / Dark. Stored
// on-device (expo-secure-store, see theme/useThemeStore.ts) and never sent to
// the server: it's a per-person, per-device choice, deliberately independent
// of the chapter-wide branding an admin controls one screen over.
//
// Selecting a mode applies it immediately, with no confirmation step and no
// navigation reset — the tree repaints through useTheme()'s subscription, so
// this screen, the header above it, and the Settings screen underneath it all
// change together and popping back lands exactly where you left off.

import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";

import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { buildPalette } from "../../theme/palette";
import { useThemeStore, type ThemeMode } from "../../theme/useThemeStore";

const OPTIONS: { mode: ThemeMode; label: string; description: string; icon: string }[] = [
  {
    mode: "system",
    label: "Match device",
    description: "Follows your iPhone's Light/Dark setting, including its schedule.",
    icon: "⚙️",
  },
  {
    mode: "light",
    label: "Light",
    description: "Always light, whatever your device is set to.",
    icon: "☀️",
  },
  {
    mode: "dark",
    label: "Dark",
    description: "Always dark, whatever your device is set to.",
    icon: "🌙",
  },
];

/**
 * Miniature of the app rendered in a specific scheme, built from the real
 * palette rather than hard-coded swatches — so it always reflects the
 * chapter's current branding, and can't drift from what the app actually
 * looks like.
 */
function SchemePreview({ scheme, label }: { scheme: "light" | "dark"; label: string }) {
  const { branding } = useTheme();
  const p = buildPalette(scheme, branding);

  return (
    <View style={styles.previewColumn}>
      <View style={[styles.preview, { backgroundColor: p.background, borderColor: p.border }]}>
        <View style={[styles.previewHeader, { backgroundColor: p.headerBackground }]}>
          <View style={[styles.previewHeaderBar, { backgroundColor: p.headerText, opacity: 0.9 }]} />
        </View>
        <View style={[styles.previewCard, { backgroundColor: p.surface, borderColor: p.border }]}>
          <View style={[styles.previewLine, { backgroundColor: p.textPrimary, width: "70%" }]} />
          <View style={[styles.previewLine, { backgroundColor: p.textMuted, width: "45%" }]} />
          <View style={[styles.previewPill, { backgroundColor: p.primary }]} />
        </View>
        <View style={[styles.previewTabBar, { backgroundColor: p.tabBarBackground, borderTopColor: p.tabBarBorder }]}>
          <View style={[styles.previewTabDot, { backgroundColor: p.tabBarActive }]} />
          <View style={[styles.previewTabDot, { backgroundColor: p.tabBarInactive }]} />
          <View style={[styles.previewTabDot, { backgroundColor: p.tabBarInactive }]} />
        </View>
      </View>
      <Text style={styles.previewLabel}>{label}</Text>
    </View>
  );
}

export default function AppearanceScreen() {
  const { colors, scheme } = useTheme();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.sectionHeader}>Preview</Text>
      <View style={styles.previewRow}>
        <SchemePreview scheme="light" label="Light" />
        <SchemePreview scheme="dark" label="Dark" />
      </View>
      <Text style={styles.hint}>
        Previews use your chapter's colors. Currently showing the{" "}
        {scheme === "dark" ? "dark" : "light"} theme.
      </Text>

      <Text style={styles.sectionHeader}>Theme</Text>
      <View style={styles.group}>
        {OPTIONS.map((option, index) => {
          const selected = mode === option.mode;
          return (
            <Pressable
              key={option.mode}
              style={({ pressed }) => [
                styles.option,
                index === OPTIONS.length - 1 && styles.optionLast,
                pressed && styles.optionPressed,
              ]}
              onPress={() => setMode(option.mode)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
            >
              <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                <Text style={styles.optionIconText}>{option.icon}</Text>
              </View>
              <View style={styles.optionBody}>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {option.label}
                </Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        This setting is saved on this device only. It doesn't change what other
        members of your chapter see.
      </Text>

      <View style={[styles.contrastCard, { borderColor: colors.border }]}>
        <Text style={styles.contrastTitle}>Active theme</Text>
        <Text style={styles.contrastBody}>
          {scheme === "dark" ? "Dark" : "Light"}
          {mode === "system" ? " (following your device)" : ""}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },

  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 26, lineHeight: 17 },
  footnote: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginBottom: 20 },

  // Preview
  previewRow: { flexDirection: "row", gap: 14 },
  previewColumn: { flex: 1 },
  preview: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    height: 150,
  },
  previewHeader: { height: 34, justifyContent: "center", paddingHorizontal: 10 },
  previewHeaderBar: { height: 6, width: "45%", borderRadius: 3 },
  previewCard: {
    margin: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 7,
  },
  previewLine: { height: 6, borderRadius: 3, opacity: 0.85 },
  previewPill: { height: 16, width: "50%", borderRadius: 8, marginTop: 2 },
  previewTabBar: {
    height: 28,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
  },
  previewTabDot: { width: 10, height: 10, borderRadius: 5 },
  previewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },

  // Options
  group: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 20,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  optionLast: { borderBottomWidth: 0 },
  optionPressed: { backgroundColor: colors.surfaceAlt },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  optionIconSelected: { backgroundColor: colors.primarySoft },
  optionIconText: { fontSize: 17 },
  optionBody: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  optionLabelSelected: { color: colors.primaryTint },
  optionDescription: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.primaryTint },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryTint },

  contrastCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  contrastTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  contrastBody: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 4 },
}));
