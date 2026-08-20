// src/screens/onboarding/JoinChapterScreen.tsx
//
// Shown whenever the signed-in user has no chapter membership yet (spec §2/
// §3 — never auto-assigned). Two ways in, both backed by chapters.routes.ts:
//   1. Enter an invite code (or open a chapterhub://join?code=XXXX deep
//      link, which pre-fills this same field — see App.tsx linking config).
//   2. Browse chapters and request to join; OnboardingNavigator switches to
//      PendingApprovalScreen once a request is outstanding.
//
// On successful redemption, useAuthStore.user.hasChapter flips true and
// RootNavigator reactively swaps to AppNavigator — no explicit nav call.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useAppAuth } from "../../hooks/useAppAuth";
import { useAuthStore } from "../../store/useAuthStore";
import { listChapters, redeemInviteCode, requestToJoinChapter } from "../../api/chapters";
import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import type { ChapterSummary } from "../../types";
import type { OnboardingStackParamList } from "../../navigation/types";

type RoutePropType = RouteProp<OnboardingStackParamList, "JoinChapter">;

export default function JoinChapterScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const route = useRoute<RoutePropType>();
  const setUser = useAuthStore((s) => s.setUser);
  const currentUser = useAuthStore((s) => s.user);
  const { signOut } = useAppAuth();

  // Pre-filled when opened via an invite deep link
  // (chapterhub://join?code=XXXX) — see RootNavigator's linking config.
  const [code, setCode] = useState(route.params?.code ?? "");
  const [redeeming, setRedeeming] = useState(false);
  const [mode, setMode] = useState<"code" | "browse">("code");
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const loadChapters = useCallback(async () => {
    setLoadingChapters(true);
    try {
      setChapters(await listChapters());
    } catch {
      /* handled by empty state */
    } finally {
      setLoadingChapters(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "browse") loadChapters();
  }, [mode, loadChapters]);

  async function handleRedeem() {
    if (!code.trim()) return;
    setRedeeming(true);
    try {
      const user = await redeemInviteCode(code.trim().toUpperCase());
      setUser({
        ...currentUser!,
        hasChapter: user.hasChapter,
        chapterId: user.chapterId,
        role: user.role,
        office: user.office,
        status: user.status,
        roleNumber: user.roleNumber,
        committeeChairOf: user.committeeChairOf,
      });
    } catch (e: any) {
      Alert.alert("Couldn't join", e?.message ?? "Check the code and try again.");
    } finally {
      setRedeeming(false);
    }
  }

  async function handleRequestToJoin(chapter: ChapterSummary) {
    setRequestingId(chapter.id);
    try {
      const joinRequest = await requestToJoinChapter(chapter.id);
      setUser({ ...currentUser!, hasChapter: false, pendingJoinRequest: joinRequest });
    } catch (e: any) {
      Alert.alert("Couldn't send request", e?.message ?? "Please try again.");
    } finally {
      setRequestingId(null);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>Join your chapter</Text>
        <Text style={styles.subtitle}>Your account is ready — now connect it to a chapter.</Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, mode === "code" && styles.tabActive]} onPress={() => setMode("code")}>
          <Text style={[styles.tabText, mode === "code" && styles.tabTextActive]}>Invite Code</Text>
        </Pressable>
        <Pressable style={[styles.tab, mode === "browse" && styles.tabActive]} onPress={() => setMode("browse")}>
          <Text style={[styles.tabText, mode === "browse" && styles.tabTextActive]}>Request to Join</Text>
        </Pressable>
      </View>

      {mode === "code" ? (
        <View style={styles.section}>
          <Text style={styles.label}>Have a code or tapped an invite link?</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="ABCD1234"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
          />
          <Pressable
            style={[styles.primaryButton, (!code.trim() || redeeming) && styles.buttonDisabled]}
            onPress={handleRedeem}
            disabled={!code.trim() || redeeming}
          >
            {redeeming ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryButtonText}>Join Chapter</Text>}
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          {loadingChapters ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={chapters}
              keyExtractor={(c) => c.id}
              ListEmptyComponent={<Text style={styles.emptyText}>No chapters found yet.</Text>}
              renderItem={({ item }) => (
                <View style={styles.chapterCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chapterName}>{item.name}</Text>
                    {(item.letters || item.university) && (
                      <Text style={styles.chapterMeta}>
                        {[item.letters, item.university].filter(Boolean).join(" · ")}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    style={[styles.requestButton, requestingId === item.id && styles.buttonDisabled]}
                    onPress={() => handleRequestToJoin(item)}
                    disabled={requestingId === item.id}
                  >
                    {requestingId === item.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.requestButtonText}>Request</Text>
                    )}
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      )}

      <Pressable style={styles.signOutRow} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24, paddingTop: 56 },
  header: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: "800", color: colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  tabRow: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 20, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  tabTextActive: { color: colors.primaryText },

  section: { flex: 1 },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 10 },
  codeInput: {
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    fontSize: 22, fontWeight: "700", letterSpacing: 4, textAlign: "center", color: colors.textPrimary,
    paddingVertical: 16, marginBottom: 16,
  },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  primaryButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },

  chapterCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10,
  },
  chapterName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  chapterMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  requestButton: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  requestButtonText: { color: colors.primaryTint, fontWeight: "700", fontSize: 13 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 30 },

  signOutRow: { alignItems: "center", paddingVertical: 16 },
  signOutText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
}));
