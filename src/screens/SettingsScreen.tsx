// src/screens/SettingsScreen.tsx
//
// The Settings hub — reached from Profile › Settings. Every submenu below is
// a plain `navigation.navigate()` push onto the SAME app stack this screen
// lives on, which is what makes Settings → submenu → Back a push/pop pair
// that leaves this screen's component instance mounted underneath. Coming
// back re-focuses the existing instance; it does not remount it.
//
// Two other things keep the "no reload on back" promise:
//   · useFocusRefresh (see hooks/useFocusRefresh.ts) — the first focus loads
//     with a spinner, later focuses refresh silently, and a return within the
//     staleness window skips the request entirely. The old
//     useFocusEffect(load) pattern flipped `loading` back to true on every
//     return and swapped the whole screen for a centered spinner.
//   · Theme changes repaint through useTheme()'s subscription rather than by
//     remounting anything, so switching Light/Dark from the Appearance
//     submenu and popping back lands on this screen exactly as it was left,
//     in the new colors.
//
// Integration:
//   · getChapterSettings → api/settings.ts (chapter name shown in the header card)
//   · useThemeStore      → current appearance mode + branding summary
//   · usePermissions     → gates the chapter-administration rows
//   · useModulesStore    → hides Documents/Feedback when their module is off

import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";
import { useThemeStore } from "../theme/useThemeStore";
import { usePermissions } from "../hooks/usePermissions";
import { useModulesStore } from "../store/useModulesStore";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import { useAuthStore } from "../store/useAuthStore";
import { useAppAuth } from "../hooks/useAppAuth";
import { getChapterSettings } from "../api/settings";
import { setAuthToken } from "../api/client";
import { DEMO_MODE } from "../config/demo";
import { DEMO_DEFAULT_USER_ID } from "../mocks/identity";
import { switchDemoUser } from "../mocks/bootstrap";
import type { AppStackParamList } from "../navigation/types";
import type { ChapterSettings } from "../types";

type NavProp = NativeStackNavigationProp<AppStackParamList>;

const APP_VERSION = "1.4.0";

const MODE_LABEL: Record<string, string> = {
  system: "Match device",
  light: "Light",
  dark: "Dark",
};

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SettingsRow({
  icon,
  label,
  sub,
  value,
  onPress,
  last,
  destructive,
}: {
  icon: string;
  label: string;
  sub?: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        last && styles.rowLast,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      <View style={[styles.rowIcon, destructive && styles.rowIconDestructive]}>
        <Text style={styles.rowIconText}>{icon}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, destructive && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  useTheme();
  const navigation = useNavigation<NavProp>();
  const { isSuperAdmin, can } = usePermissions();
  const mode = useThemeStore((s) => s.mode);
  const branding = useThemeStore((s) => s.branding);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { signOut } = useAppAuth();

  const isDocumentsEnabled = useModulesStore((s) => s.isEnabled("documents"));
  const isFeedbackEnabled = useModulesStore((s) => s.isEnabled("feedback"));

  const [settings, setSettings] = useState<ChapterSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async ({ silent }: { silent: boolean }) => {
    // Only the first load blanks the screen. A silent refresh leaves the
    // rendered settings list exactly where it is and swaps the data in when
    // it arrives — that's the difference between "refreshed" and "reloaded".
    if (!silent) setLoading(true);
    try {
      setSettings(await getChapterSettings());
    } catch {
      // Non-fatal: every row below still works without the chapter header.
    } finally {
      setLoading(false);
    }
  }, []);

  // Chapter settings can't change while the user is inside one of this
  // screen's own submenus, so a return within 30s skips the request outright.
  // Editing Chapter Settings itself takes longer than that round trip, so a
  // real edit still shows up on the way back.
  useFocusRefresh(load, { staleAfterMs: 30_000 });

  function handleSignOut() {
    if (DEMO_MODE) {
      Alert.alert(
        "Demo Mode",
        "There's no real account to sign out of — this is a local demo. Reset to the default demo user instead?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Reset", onPress: () => switchDemoUser(DEMO_DEFAULT_USER_ID) },
        ]
      );
      return;
    }
    Alert.alert("Sign out", "You'll need to sign back in to access ChapterHub.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          setAuthToken(null);
          setUser(null);
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accentTint} />
      </View>
    );
  }

  const canManageBranding = can("settings.manage");
  const canManageInvites = can("chapters.manageInvites");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Chapter identity card — doubles as a live branding preview, so the
          effect of a color change is visible the moment you pop back here. */}
      <View style={styles.chapterCard}>
        <View style={styles.chapterMark}>
          <Text style={styles.chapterMarkText}>
            {branding.logoEmoji || branding.chapterLetters || "ΘΤ"}
          </Text>
        </View>
        <View style={styles.chapterBody}>
          <Text style={styles.chapterName} numberOfLines={2}>
            {branding.chapterName || settings?.chapterName || "ChapterHub"}
          </Text>
          <Text style={styles.chapterMeta} numberOfLines={1}>
            {settings?.university ?? ""}
          </Text>
          <View style={styles.swatchRow}>
            <View style={[styles.swatch, { backgroundColor: colors.primary }]} />
            <View style={[styles.swatch, { backgroundColor: colors.accent }]} />
            <Text style={styles.swatchLabel}>Chapter colors</Text>
          </View>
        </View>
      </View>

      <SectionHeader title="Appearance" />
      <View style={styles.group}>
        <SettingsRow
          icon="🎨"
          label="Theme"
          sub="Light, Dark, or match your device"
          value={MODE_LABEL[mode]}
          onPress={() => navigation.navigate("Appearance")}
          last={!canManageBranding}
        />
        {canManageBranding && (
          <SettingsRow
            icon="⚜️"
            label="Chapter Branding"
            sub="Colors, name, and logo for everyone in the chapter"
            onPress={() => navigation.navigate("ChapterBranding")}
            last
          />
        )}
      </View>

      <SectionHeader title="Account" />
      <View style={styles.group}>
        <SettingsRow
          icon="👤"
          label="Edit Profile"
          sub="Name, major, graduation year, contact info"
          onPress={() => navigation.navigate("EditProfile")}
        />
        <SettingsRow
          icon="🌳"
          label="My Family"
          sub="Your Big and Littles"
          onPress={() => navigation.navigate("MyFamily", {})}
          last={!isFeedbackEnabled && !isDocumentsEnabled}
        />
        {isDocumentsEnabled && (
          <SettingsRow
            icon="📄"
            label="Documents"
            sub="Chapter files, forms, and external links"
            onPress={() => navigation.navigate("Documents")}
            last={!isFeedbackEnabled}
          />
        )}
        {isFeedbackEnabled && (
          <SettingsRow
            icon="💬"
            label="Send Feedback"
            sub="Report a bug or request a feature"
            onPress={() => navigation.navigate("Feedback")}
            last
          />
        )}
      </View>

      {canManageInvites && (
        <>
          <SectionHeader title="Chapter Membership" />
          <View style={styles.group}>
            <SettingsRow
              icon="🔗"
              label="Invite Codes"
              sub="Create, edit, archive, and regenerate join codes"
              onPress={() => navigation.navigate("ChapterInviteManager")}
            />
            <SettingsRow
              icon="📥"
              label="Join Requests"
              sub="Review pending requests to join the chapter"
              onPress={() => navigation.navigate("JoinRequests")}
              last
            />
          </View>
        </>
      )}

      {isSuperAdmin && (
        <>
          <SectionHeader title="Chapter Administration" />
          <View style={styles.group}>
            <SettingsRow
              icon="🏛"
              label="Chapter Settings"
              sub="Semester dates, dues & attendance defaults"
              value={settings?.currentSemesterLabel}
              onPress={() => navigation.navigate("ChapterSettings")}
            />
            <SettingsRow
              icon="🧩"
              label="Modules"
              sub="Enable or disable entire app sections"
              onPress={() => navigation.navigate("Modules")}
            />
            <SettingsRow
              icon="🔑"
              label="Permissions"
              sub="Edit what each role can do"
              onPress={() => navigation.navigate("Permissions")}
              last
            />
          </View>
        </>
      )}

      <SectionHeader title="About" />
      <View style={styles.group}>
        <View style={[styles.row, styles.rowLast]}>
          <View style={styles.rowIcon}>
            <Text style={styles.rowIconText}>ℹ️</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>ChapterHub</Text>
            <Text style={styles.rowSub}>
              Version {APP_VERSION}
              {DEMO_MODE ? " · Demo Mode" : ""}
            </Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>
          {DEMO_MODE ? "Reset demo session" : `Sign out${user?.username ? ` (@${user.username})` : ""}`}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },

  // Chapter identity / branding preview
  chapterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 24,
  },
  chapterMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  chapterMarkText: { fontSize: 24, color: colors.primaryText, fontWeight: "800" },
  chapterBody: { flex: 1 },
  chapterName: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  chapterMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  swatchRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchLabel: { fontSize: 11, color: colors.textMuted, marginLeft: 2 },

  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  group: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 22,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDestructive: { backgroundColor: colors.dangerSoft },
  rowIconText: { fontSize: 17 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  rowValue: { fontSize: 13, color: colors.textSecondary, fontWeight: "600", maxWidth: 110 },
  rowChevron: { fontSize: 20, color: colors.textMuted, fontWeight: "300" },

  signOutBtn: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  signOutText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
}));
