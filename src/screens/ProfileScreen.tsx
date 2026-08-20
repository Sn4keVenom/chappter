// src/screens/ProfileScreen.tsx
//
// Profile tab. Shows the current user's personal data: points this semester,
// attendance history (last 5), dues status, achievements, and committee
// memberships.
//
// Integration:
//   - getMe           → api/users.ts
//   - getMyDues       → api/dues.ts (returns DuesRecord[])
//   - getMyAttendanceHistory → api/attendance.ts (returns { records, nextCursor })
//   - getLeaderboard  → api/users.ts (for current-semester rank)
//   - getPointsLedger → api/users.ts (feeds achievements — bonus/attendance counts)
//   - useAuthStore: setUser(null) on sign-out
//   - setAuthToken(null): api/client.ts
//   - hooks/useAppAuth: Clerk signOut, demo-safe (see hook for why)
//   - utils/achievements: computeAchievements — pure, works in demo or live mode
//   - types/index.ts: User, DuesRecord, DuesStatus, AttendanceRecord, formatCurrency, fullName

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import { useAppAuth } from "../hooks/useAppAuth";

import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";
import { Dialog, DialogActions, DialogButton } from "../components/Dialog";
import { duesStatusColor } from "../theme/semantic";
import { useAuthStore } from "../store/useAuthStore";
import { useModulesStore } from "../store/useModulesStore";
import { getMe, getLeaderboard, getPointsLedger } from "../api/users";
import { getMyDues, payDuesWithPyli } from "../api/dues";
import { getMyAttendanceHistory } from "../api/attendance";
import { setAuthToken } from "../api/client";
import { DEMO_MODE } from "../config/demo";
import { DEMO_SWITCHABLE_USERS, DEMO_DEFAULT_USER_ID } from "../mocks/identity";
import { switchDemoUser } from "../mocks/bootstrap";
import { computeAchievements, type Achievement } from "../utils/achievements";
import type { User, DuesRecord, DuesStatus, DuesPlan, AttendanceRecord, ExecOffice } from "../types";
import { formatCurrency, fullName } from "../types";

function officeLabel(office?: ExecOffice | null): string {
  if (!office) return "";
  return office.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
}


const MONTHLY_INSTALLMENTS = 3;

// Pay-with-Pyli modal (Feature 4). Pyli is the chapter's external payment
// provider — this deliberately isn't a real payment integration (no SDK,
// no card entry). It's an honest stand-in: pick a plan, brief "processing"
// state (the demo-mode network adapter's artificial latency covers this),
// payment posts exactly like an officer-recorded one would, just
// self-initiated with method="PYLI". See src/mocks/api.ts payDuesWithPyli.
function PyliPayModal({
  visible, dues, onClose, onPaid,
}: {
  visible: boolean;
  dues: DuesRecord | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [plan, setPlan] = useState<DuesPlan>("FULL");
  const [paying, setPaying] = useState(false);

  useEffect(() => { if (visible) setPlan("FULL"); }, [visible]);

  if (!dues) return null;
  const remaining = dues.amountOwed - dues.amountPaid;
  const monthlyInstallment = Math.min(remaining, Math.ceil(dues.amountOwed / MONTHLY_INSTALLMENTS));
  const amount = plan === "FULL" ? remaining : monthlyInstallment;

  async function handlePay() {
    setPaying(true);
    try {
      await payDuesWithPyli({ semesterId: dues!.semesterId, amount, plan });
      onPaid();
      onClose();
      Alert.alert("Payment complete", `${formatCurrency(amount)} paid via Pyli.`);
    } catch (e: any) {
      Alert.alert("Payment failed", e?.message ?? "Could not process payment via Pyli.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <Dialog
      visible={visible}
      onRequestClose={onClose}
      title="Pay Dues with Pyli"
      subtitle={`${dues.semester.label} · ${formatCurrency(remaining)} remaining`}
      footer={
        <DialogActions>
          <DialogButton label="Cancel" onPress={onClose} disabled={paying} />
          <DialogButton
            label={`Pay ${formatCurrency(amount)}`}
            variant="primary"
            onPress={handlePay}
            busy={paying}
          />
        </DialogActions>
      }
    >
      <View style={styles.planWrap}>
          <View style={styles.planRow}>
            <Pressable
              style={[styles.planOption, plan === "FULL" && styles.planOptionSelected]}
              onPress={() => setPlan("FULL")}
            >
              <Text style={[styles.planLabel, plan === "FULL" && styles.planLabelSelected]}>Pay in Full</Text>
              <Text style={[styles.planAmount, plan === "FULL" && styles.planLabelSelected]}>
                {formatCurrency(remaining)}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.planOption, plan === "MONTHLY" && styles.planOptionSelected]}
              onPress={() => setPlan("MONTHLY")}
            >
              <Text style={[styles.planLabel, plan === "MONTHLY" && styles.planLabelSelected]}>Monthly</Text>
              <Text style={[styles.planAmount, plan === "MONTHLY" && styles.planLabelSelected]}>
                {formatCurrency(monthlyInstallment)}/mo
              </Text>
            </Pressable>
          </View>

          {plan === "MONTHLY" && (
            <Text style={styles.planHint}>
              First installment charged now via Pyli — {MONTHLY_INSTALLMENTS} installments total.
            </Text>
          )}
      </View>
    </Dialog>
  );
}

export default function ProfileScreen() {
  // Repaints this screen when the appearance mode or chapter branding
  // changes — `styles` and `colors` resolve against the active theme.
  useTheme();
  const navigation = useNavigation<any>();
  const userFromStore = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { signOut } = useAppAuth();
  const isDocumentsEnabled = useModulesStore((s) => s.isEnabled("documents"));
  const isFeedbackEnabled = useModulesStore((s) => s.isEnabled("feedback"));

  const [profile, setProfile] = useState<User | null>(null);
  const [dues, setDues] = useState<DuesRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [semesterLabel, setSemesterLabel] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);

  const load = useCallback(async (isRefresh = false, silent = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    try {
      const [me, duesRecords, histResult, board] = await Promise.all([
        getMe(),
        getMyDues(),
        getMyAttendanceHistory({ limit: 5 }),
        getLeaderboard(),
      ]);

      setProfile(me);
      // Show most recent semester's dues record (first in the array, sorted by createdAt desc)
      const currentDues = duesRecords[0] ?? null;
      setDues(currentDues);
      setHistory(histResult.records);

      // Find self on leaderboard
      const self = board.leaderboard.find((e) => e.userId === me.id);
      setRank(self?.rank ?? null);
      setTotalPoints(self?.total ?? 0);
      setSemesterLabel(board.semesterLabel);

      // Achievements are derived from the full ledger, not just the 5 most
      // recent attendance rows shown above.
      const ledger = await getPointsLedger(me.id, { limit: 200 });
      setAchievements(
        computeAchievements({
          totalPoints: self?.total ?? 0,
          rank: self?.rank ?? null,
          attendanceCount: ledger.entries.filter((e) => e.type === "ATTENDANCE").length,
          lateCount: histResult.records.filter((r) => r.late).length,
          bonusCount: ledger.entries.filter((e) => e.type === "BONUS").length,
          duesStatus: currentDues?.status ?? null,
          committeeCount: me.committeeMemberships?.length ?? 0,
        })
      );
    } catch {
      // Non-fatal — show what we have from the store
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh on focus — returning here after editing your profile
  // (EditProfileScreen) should show the new name/major/etc. immediately
  // instead of the stale snapshot from tab mount. useFocusRefresh, not a bare
  // useFocusEffect: only the first load shows the full-screen spinner, so
  // coming back from a pushed screen refreshes underneath the existing
  // content rather than blanking the tab. See hooks/useFocusRefresh.ts.
  useFocusRefresh(useCallback(({ silent }) => load(false, silent), [load]));

  const handleSignOut = () => {
    if (DEMO_MODE) {
      Alert.alert(
        "Demo Mode",
        "There's no real account to sign out of — this is a local demo. Reset to the default demo user instead?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reset",
            onPress: () => {
              switchDemoUser(DEMO_DEFAULT_USER_ID);
              load();
            },
          },
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
  };

  const handleSwitchRole = () => {
    Alert.alert(
      "Switch demo role",
      "View the app as a different mock user to see role-gated features (Admin tab, dues management, committee scope, etc).",
      [
        ...DEMO_SWITCHABLE_USERS.map(({ user, blurb }) => ({
          text: `${user.firstName} ${user.lastName} — ${user.role}${user.id === userFromStore?.id ? " (current)" : ""}`,
          onPress: () => {
            switchDemoUser(user.id);
            load();
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const displayName = profile
    ? fullName(profile)
    : `${userFromStore?.firstName ?? ""} ${userFromStore?.lastName ?? ""}`.trim();

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
      {DEMO_MODE && (
        <Pressable style={styles.demoBanner} onPress={handleSwitchRole}>
          <Text style={styles.demoBannerText}>🎭 Demo Mode — viewing as {profile?.role ?? userFromStore?.role}</Text>
          <Text style={styles.demoBannerLink}>Switch role →</Text>
        </Pressable>
      )}

      {/* Avatar + identity */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitials}>
            {(profile?.firstName ?? userFromStore?.firstName ?? "?").charAt(0)}
          </Text>
        </View>
        <Text style={styles.heroName}>{displayName}</Text>
        {profile?.username && <Text style={styles.heroUsername}>@{profile.username}</Text>}
        <Text style={styles.heroRole}>
          {(profile?.office ?? userFromStore?.office)
            ? `${officeLabel(profile?.office ?? userFromStore?.office)} · `
            : ""}
          {profile?.role ?? userFromStore?.role}
          {profile?.roleNumber != null ? ` · #${profile.roleNumber}` : ""}
        </Text>
        {profile?.pledgeClassLabel && (
          <Text style={styles.heroPledgeClass}>{profile.pledgeClassLabel}</Text>
        )}
        {(profile?.major || profile?.graduationYear) && (
          <Text style={styles.heroMeta}>
            {[profile?.major, profile?.graduationYear ? `Class of ${profile.graduationYear}` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
        {profile?.email && (
          <Text style={styles.heroEmail}>{profile.email}</Text>
        )}
        <Pressable style={styles.editProfileBtn} onPress={() => navigation.navigate("EditProfile")}>
          <Text style={styles.editProfileBtnText}>Edit Profile</Text>
        </Pressable>
      </View>

      {/* Family (Big/Little) — spec §7/§8 */}
      <Pressable style={styles.card} onPress={() => navigation.navigate("MyFamily", {})}>
        <Text style={styles.cardLabel}>Family</Text>
        <Text style={styles.familyLinkText}>View my Big &amp; Littles ›</Text>
      </Pressable>

      {/* Points card */}
      {semesterLabel && (
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate("Leaderboard")}
        >
          <Text style={styles.cardLabel}>Points — {semesterLabel}</Text>
          <View style={styles.pointsRow}>
            <Text style={styles.pointsTotal}>{totalPoints}</Text>
            {rank && (
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>#{rank}</Text>
              </View>
            )}
          </View>
        </Pressable>
      )}

      {/* Team card */}
      {profile?.teamId && profile.teamName && (
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate("TeamDetail", { teamId: profile.teamId! })}
        >
          <Text style={styles.cardLabel}>Team</Text>
          <Text style={styles.teamName}>{profile.teamName}</Text>
        </Pressable>
      )}

      {/* Dues card */}
      {dues && (
        <View style={[styles.card, { borderLeftColor: duesStatusColor(dues.status), borderLeftWidth: 4 }]}>
          <Text style={styles.cardLabel}>Dues — {dues.semester.label}</Text>
          <View style={styles.duesRow}>
            <Text style={[styles.duesStatus, { color: duesStatusColor(dues.status) }]}>
              {dues.status}
            </Text>
            <Text style={styles.duesAmount}>
              {formatCurrency(dues.amountPaid)} paid of {formatCurrency(dues.amountOwed)}
            </Text>
          </View>
          {dues.plan && (
            <Text style={styles.duesPlan}>{dues.plan === "MONTHLY" ? "Monthly plan via Pyli" : "Paid in full via Pyli"}</Text>
          )}
          {dues.dueDate && dues.status !== "PAID" && dues.status !== "WAIVED" && (
            <Text style={styles.dueDue}>
              Due {new Date(dues.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </Text>
          )}
          {(dues.status === "UNPAID" || dues.status === "PARTIAL") && (
            <Pressable style={styles.payBtn} onPress={() => setPayModalVisible(true)}>
              <Text style={styles.payBtnText}>Pay with Pyli</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Achievements */}
      {achievements.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <View style={styles.badgeRow}>
            {achievements.map((a) => (
              <View key={a.id} style={[styles.badge, !a.earned && styles.badgeUnearned]}>
                <Text style={[styles.badgeIcon, !a.earned && styles.badgeIconUnearned]}>{a.icon}</Text>
                <Text style={[styles.badgeLabel, !a.earned && styles.badgeLabelUnearned]}>{a.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Committee memberships */}
      {(profile?.committeeMemberships?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Committees</Text>
          {profile!.committeeMemberships!.map((m) => (
            <Pressable
              key={m.committeeId}
              style={styles.committeeRow}
              onPress={() => navigation.navigate("CommitteeDetail", { committeeId: m.committeeId })}
            >
              <Text style={styles.committeeName}>{m.committeeName}</Text>
              <Text style={styles.committeeRole}>{m.role}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Recent attendance */}
      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent attendance</Text>
          {history.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.historyRow}
              onPress={() => navigation.navigate("EventDetail", { eventId: entry.event.id })}
            >
              <View style={styles.historyInfo}>
                <Text style={styles.historyTitle} numberOfLines={1}>
                  {entry.event.title}
                </Text>
                <Text style={styles.historyMeta}>
                  {new Date(entry.event.startTime).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  {entry.late ? " · Late" : ""}
                  {" · "}
                  {entry.method === "MANUAL" ? "Manual" : "QR"}
                </Text>
              </View>
              <Text style={[styles.historyPoints, entry.late && { color: colors.warning }]}>
                +{entry.pointsAwarded}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* More — Documents & Feedback (spec §8/§9), hidden when their module
          is disabled via Chapter Settings > Modules */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>More</Text>
        <Pressable style={styles.moreRow} onPress={() => navigation.navigate("Settings")}>
          <Text style={styles.moreRowText}>⚙️ Settings</Text>
          <Text style={styles.moreRowChevron}>›</Text>
        </Pressable>
        {isDocumentsEnabled && (
          <Pressable style={styles.moreRow} onPress={() => navigation.navigate("Documents")}>
            <Text style={styles.moreRowText}>📄 Documents</Text>
            <Text style={styles.moreRowChevron}>›</Text>
          </Pressable>
        )}
        {isFeedbackEnabled && (
          <Pressable style={styles.moreRow} onPress={() => navigation.navigate("Feedback")}>
            <Text style={styles.moreRowText}>💬 Send Feedback</Text>
            <Text style={styles.moreRowChevron}>›</Text>
          </Pressable>
        )}
      </View>

      {/* Sign out */}
      <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>{DEMO_MODE ? "Reset demo session" : "Sign out"}</Text>
      </Pressable>

      <PyliPayModal
        visible={payModalVisible}
        dues={dues}
        onClose={() => setPayModalVisible(false)}
        onPaid={() => load()}
      />
    </ScrollView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },

  // Demo banner
  demoBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.accentSoft, borderRadius: 10, borderWidth: 1, borderColor: colors.accentSoftBorder,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20,
  },
  demoBannerText: { fontSize: 12, fontWeight: "600", color: colors.textPrimary, flex: 1, marginRight: 8 },
  demoBannerLink: { fontSize: 12, fontWeight: "700", color: colors.accent },

  // Hero
  hero: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  avatarInitials: { fontSize: 30, fontWeight: "800", color: colors.primaryText },
  heroName: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  heroUsername: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  heroRole: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  heroPledgeClass: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  heroMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  heroEmail: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  editProfileBtn: {
    marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  editProfileBtnText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  familyLinkText: { fontSize: 15, fontWeight: "600", color: colors.link },

  // Cards
  card: {
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: {
    fontSize: 11, fontWeight: "700", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
  },
  teamName: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },

  // Points
  pointsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pointsTotal: { fontSize: 32, fontWeight: "800", color: colors.textPrimary },
  rankBadge: {
    backgroundColor: colors.accentSoft, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  rankText: { color: colors.accent, fontWeight: "700", fontSize: 16 },

  // Dues
  duesRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  duesStatus: { fontSize: 18, fontWeight: "800" },
  duesAmount: { fontSize: 13, color: colors.textSecondary },
  duesPlan: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  dueDue: { fontSize: 12, color: colors.warning, marginTop: 6 },
  payBtn: { marginTop: 12, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  payBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },

  // Pyli pay dialog — chrome comes from components/Dialog.tsx
  planWrap: { marginTop: 16 },
  planRow: { flexDirection: "row", gap: 10 },
  planOption: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: "center", backgroundColor: colors.background },
  planOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  planLabel: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  planLabelSelected: { color: colors.primaryText },
  planAmount: { fontSize: 15, fontWeight: "800", color: colors.textPrimary, marginTop: 4 },
  planHint: { fontSize: 12, color: colors.textMuted, marginTop: 10, lineHeight: 17 },

  // Section
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12, fontWeight: "700", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
  },

  // Achievement badges
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.accent,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  badgeUnearned: { borderColor: colors.border, opacity: 0.55 },
  badgeIcon: { fontSize: 14 },
  badgeIconUnearned: { opacity: 0.6 },
  badgeLabel: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
  badgeLabelUnearned: { color: colors.textMuted },

  // Committee rows
  committeeRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  committeeName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  committeeRole: { fontSize: 12, color: colors.textMuted, fontWeight: "600", textTransform: "uppercase" },

  // Attendance history
  historyRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  historyInfo: { flex: 1 },
  historyTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  historyMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  historyPoints: { fontSize: 16, fontWeight: "800", color: colors.success },

  // More section
  moreRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  moreRowText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  moreRowChevron: { fontSize: 18, color: colors.textMuted },

  // Sign out
  signOutBtn: {
    marginTop: 24, paddingVertical: 14, alignItems: "center",
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
  },
  signOutText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
}));
