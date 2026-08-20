// src/screens/onboarding/PendingApprovalScreen.tsx
//
// Shown while the user's "Request to Join" is still PENDING (see
// OnboardingNavigator, which picks this over JoinChapterScreen based on
// useAuthStore.user.pendingJoinRequest). Re-checks on focus so approval
// while the app is backgrounded is picked up without a manual refresh
// button — this is a low-frequency event (an officer reviewing requests),
// so a focus-triggered check is enough; no polling loop needed.

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAppAuth } from "../../hooks/useAppAuth";
import { useAuthStore } from "../../store/useAuthStore";
import { getMyPendingJoinRequest } from "../../api/chapters";
import { getMe } from "../../api/users";
import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";

export default function PendingApprovalScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { signOut } = useAppAuth();
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const pending = await getMyPendingJoinRequest();
      if (!pending) {
        // Either approved (now has a membership) or denied — either way,
        // refetch the full profile so hasChapter/role reflect reality.
        const me = await getMe();
        setUser({
          ...user!,
          hasChapter: me.hasChapter,
          chapterId: me.chapterId,
          pendingJoinRequest: null,
          role: me.role,
          office: me.office,
          status: me.status,
          roleNumber: me.roleNumber,
          committeeChairOf: me.committeeChairOf,
        });
      }
    } catch {
      /* stay on this screen, user can retry via the button below */
    } finally {
      setChecking(false);
    }
  }, [user, setUser]);

  useFocusEffect(useCallback(() => { check(); }, [check]));

  return (
    <View style={styles.screen}>
      <Text style={styles.icon}>⏳</Text>
      <Text style={styles.title}>Request pending</Text>
      <Text style={styles.subtitle}>
        Your request to join{user?.pendingJoinRequest?.chapterName ? ` ${user.pendingJoinRequest.chapterName}` : ""} is
        waiting for an officer to review it. We'll let you in as soon as it's approved.
      </Text>

      <Pressable style={styles.checkButton} onPress={check} disabled={checking}>
        {checking ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.checkButtonText}>Check Status</Text>}
      </Pressable>

      <Pressable style={styles.signOutRow} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, marginBottom: 10 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 32 },
  checkButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  checkButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
  signOutRow: { marginTop: 24 },
  signOutText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
}));
