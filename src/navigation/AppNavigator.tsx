// src/navigation/AppNavigator.tsx
//
// Full authenticated app: bottom tab navigator (5 tabs for members,
// 6 for Officer+) nested inside a shared stack for screens accessible
// from any tab (EventDetail, CheckIn, ChannelMessages, etc.).
//
// Integration points:
//   · usePermissions.ts — canViewAdminPanel gates the AdminPanel tab
//   · theme/ThemeProvider — useTheme() drives header/tab colors, so switching
//     Light/Dark or changing chapter branding repaints the chrome without
//     remounting the navigator (route state and scroll position survive).
//   · AppStackParamList + MainTabParamList from navigation/types.ts
//   · All screen imports — see imports below. Thread still uses
//     NotImplementedScreen — no backend endpoint exists for it yet
//     (AuditLog got a real screen — see screens/admin/AuditLogScreen.tsx).

import React from "react";
import { Text } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { usePermissions } from "../hooks/usePermissions";
import { useModulesStore } from "../store/useModulesStore";
import { useTheme, ThemedStatusBar } from "../theme/ThemeProvider";
import type { Palette } from "../theme/palette";
import type { AppStackParamList, MainTabParamList } from "./types";

// ── Screen imports ────────────────────────────────────────────────────────
import HomeDashboardScreen from "../screens/HomeDashboardScreen";
import EventsFeedScreen from "../screens/EventsFeedScreen";
import EventDetailScreen from "../screens/EventDetailScreen";
import CreateEventScreen from "../screens/CreateEventScreen";
import CheckInScreen from "../screens/CheckInScreen";
import AttendanceOverrideScreen from "../screens/admin/AttendanceOverrideScreen";
import MessagingScreen from "../screens/MessagingScreen";
import ChannelMessagesScreen from "../screens/ChannelMessagesScreen";
import LeaderboardScreen from "../screens/LeaderboardScreen";
import ProfileScreen from "../screens/ProfileScreen";
import CommitteeDetailScreen from "../screens/CommitteeDetailScreen";
import AdminPanelScreen from "../screens/admin/AdminPanelScreen";
import MemberProfileScreen from "../screens/MemberProfileScreen";
import PointsAdjustScreen from "../screens/admin/PointsAdjustScreen";
import RosterDetailScreen from "../screens/admin/RosterDetailScreen";
import DuesDetailScreen from "../screens/admin/DuesDetailScreen";
import MapViewScreen from "../screens/MapViewScreen";
import NotImplementedScreen from "../screens/NotImplementedScreen";
import TeamDetailScreen from "../screens/TeamDetailScreen";
import SubmitExpenseScreen from "../screens/SubmitExpenseScreen";
import ExpensesScreen from "../screens/admin/ExpensesScreen";
import CommitteeBudgetsScreen from "../screens/admin/CommitteeBudgetsScreen";
import ChapterSettingsScreen from "../screens/admin/ChapterSettingsScreen";
import ModulesScreen from "../screens/admin/ModulesScreen";
import PermissionsScreen from "../screens/admin/PermissionsScreen";
import DocumentsScreen from "../screens/DocumentsScreen";
import DocumentCategoryScreen from "../screens/DocumentCategoryScreen";
import FeedbackScreen from "../screens/FeedbackScreen";
import FeedbackListScreen from "../screens/admin/FeedbackListScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import MyFamilyScreen from "../screens/MyFamilyScreen";
import ChapterInviteManagerScreen from "../screens/admin/ChapterInviteManagerScreen";
import JoinRequestsScreen from "../screens/admin/JoinRequestsScreen";
import AuditLogScreen from "../screens/admin/AuditLogScreen";
import SettingsScreen from "../screens/SettingsScreen";
import AppearanceScreen from "../screens/settings/AppearanceScreen";
import ChapterBrandingScreen from "../screens/settings/ChapterBrandingScreen";

const Stack = createNativeStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ── Tab bar icons (text fallback; swap for an icon library) ──────────────
const TAB_ICONS: Record<string, string> = {
  HomeDashboard: "⌂",
  EventsFeed: "◷",
  Messaging: "✉",
  Leaderboard: "★",
  Profile: "○",
  AdminPanel: "⚙",
};

function TabIcon({ name, color }: { name: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{TAB_ICONS[name] ?? "•"}</Text>;
}

/**
 * Options that take a tab OUT of the layout entirely.
 *
 * `tabBarButton: () => null` on its own is not enough, and that was the cause
 * of the misaligned bottom bar: BottomTabItem wraps every route's button in a
 * `<View style={[{ flex: 1 }, tabBarItemStyle]}>` that renders whether or not
 * the button itself returns anything. A hidden tab therefore still claimed an
 * equal share of the bar, leaving a blank gap and pushing the visible icons
 * off-center — most obviously for Members and PNMs, who don't get the Admin
 * tab. Adding `display: "none"` to that wrapper removes the flex slot too, so
 * the remaining tabs redistribute evenly at any tab count and screen width.
 *
 * The screens stay DECLARED rather than conditionally rendered, so routes
 * like navigation.navigate("Tabs", { screen: "Leaderboard" }) never target a
 * missing route — each screen still gates its own content.
 */
const HIDDEN_TAB = {
  tabBarButton: () => null,
  tabBarItemStyle: { display: "none" as const },
};

function tabScreenOptions(colors: Palette) {
  return ({ route }: { route: { name: string } }) => ({
    tabBarIcon: ({ color }: { color: string }) => <TabIcon name={route.name} color={color} />,
    tabBarActiveTintColor: colors.tabBarActive,
    tabBarInactiveTintColor: colors.tabBarInactive,
    tabBarStyle: {
      backgroundColor: colors.tabBarBackground,
      borderTopColor: colors.tabBarBorder,
    },
    headerStyle: { backgroundColor: colors.headerBackground },
    headerTintColor: colors.headerText,
    headerTitleStyle: { fontWeight: "700" as const, color: colors.headerText },
  });
}

function MainTabs() {
  const { colors } = useTheme();
  const { canViewAdminPanel } = usePermissions();
  const isMessagingEnabled = useModulesStore((s) => s.isEnabled("messaging"));
  const isPointsEnabled = useModulesStore((s) => s.isEnabled("points"));

  return (
    <Tab.Navigator screenOptions={tabScreenOptions(colors)}>
      <Tab.Screen
        name="HomeDashboard"
        component={HomeDashboardScreen}
        options={{ title: "Home" }}
      />
      <Tab.Screen
        name="EventsFeed"
        component={EventsFeedScreen}
        options={{ title: "Events" }}
      />
      {/* Messaging/Leaderboard drop out of the bar when their module is
          disabled via Chapter Settings › Modules. */}
      <Tab.Screen
        name="Messaging"
        component={MessagingScreen}
        options={{
          title: "Messages",
          ...(isMessagingEnabled ? null : HIDDEN_TAB),
        }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{
          title: "Points",
          ...(isPointsEnabled ? null : HIDDEN_TAB),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "Profile" }}
      />
      {/* Admin is Officer+ only — Members, PNMs and Alumni never see it. */}
      <Tab.Screen
        name="AdminPanel"
        component={AdminPanelScreen}
        options={{
          title: "Admin",
          ...(canViewAdminPanel ? null : HIDDEN_TAB),
        }}
      />
    </Tab.Navigator>
  );
}

// ── App stack — shared screens accessible from any tab ───────────────────
export default function AppNavigator() {
  const { colors } = useTheme();

  return (
    <>
      {/* Status bar contrast is derived from the header color, so a chapter
          branded in a pale primary still gets legible clock/battery glyphs. */}
      <ThemedStatusBar behind="header" />
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontWeight: "700", color: colors.headerText },
        headerBackTitle: "",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />

      {/* Event screens */}
      <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event" }} />
      <Stack.Screen name="CreateEvent" component={CreateEventScreen} options={{ title: "New Event" }} />
      <Stack.Screen name="EditEvent" component={CreateEventScreen} options={{ title: "Edit Event" }} />
      <Stack.Screen name="CheckIn" component={CheckInScreen} options={{ title: "Check-In" }} />
      <Stack.Screen name="AttendanceOverride" component={AttendanceOverrideScreen} options={{ title: "Attendance" }} />
      <Stack.Screen name="MapView" component={MapViewScreen} options={{ title: "Location" }} />

      {/* Messaging */}
      <Stack.Screen
        name="ChannelMessages"
        component={ChannelMessagesScreen}
        options={({ route }: any) => ({ title: route.params?.channelName ?? "Channel" })}
      />
      <Stack.Screen name="Thread" component={NotImplementedScreen} options={{ title: "Thread" }} />

      {/* Committees */}
      <Stack.Screen
        name="CommitteeDetail"
        component={CommitteeDetailScreen}
        options={{ title: "Committee" }}
      />

      {/* Member/Admin */}
      <Stack.Screen name="MemberProfile" component={MemberProfileScreen} options={{ title: "Member" }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "Edit Profile" }} />
      <Stack.Screen name="MyFamily" component={MyFamilyScreen} options={{ title: "Family" }} />
      <Stack.Screen name="AuditLog" component={AuditLogScreen} options={{ title: "Audit Log" }} />
      <Stack.Screen name="PointsAdjust" component={PointsAdjustScreen} options={{ title: "Adjust Points" }} />
      <Stack.Screen name="RosterDetail" component={RosterDetailScreen} options={{ title: "Roster" }} />
      <Stack.Screen name="DuesDetail" component={DuesDetailScreen} options={{ title: "Dues" }} />
      <Stack.Screen name="ChapterInviteManager" component={ChapterInviteManagerScreen} options={{ title: "Invites" }} />
      <Stack.Screen name="JoinRequests" component={JoinRequestsScreen} options={{ title: "Join Requests" }} />

      {/* Teams (Feature 2) */}
      <Stack.Screen name="TeamDetail" component={TeamDetailScreen} options={{ title: "Team" }} />

      {/* Committee budgets & reimbursements (Feature 5) */}
      <Stack.Screen name="SubmitExpense" component={SubmitExpenseScreen} options={{ title: "Submit Expense" }} />
      <Stack.Screen name="Expenses" component={ExpensesScreen} options={{ title: "Reimbursements" }} />
      <Stack.Screen name="CommitteeBudgets" component={CommitteeBudgetsScreen} options={{ title: "Committee Budgets" }} />

      {/* Chapter administration — Super Admin only */}
      <Stack.Screen name="ChapterSettings" component={ChapterSettingsScreen} options={{ title: "Chapter Settings" }} />
      <Stack.Screen name="Modules" component={ModulesScreen} options={{ title: "Modules" }} />
      <Stack.Screen name="Permissions" component={PermissionsScreen} options={{ title: "Permissions" }} />

      {/* Documents & external links */}
      <Stack.Screen name="Documents" component={DocumentsScreen} options={{ title: "Documents" }} />
      <Stack.Screen
        name="DocumentCategory"
        component={DocumentCategoryScreen}
        options={({ route }: any) => ({ title: route.params?.label ?? "Documents" })}
      />

      {/* Feedback & bug reports */}
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: "Send Feedback" }} />
      <Stack.Screen name="FeedbackList" component={FeedbackListScreen} options={{ title: "Feedback" }} />

      {/* Settings hub + its submenus. Registered on the shared app stack (not
          as a tab) so opening a submenu pushes onto the stack and popping
          back returns to the exact Settings screen instance — no remount, no
          refetch. See SettingsScreen's doc comment. */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <Stack.Screen name="Appearance" component={AppearanceScreen} options={{ title: "Appearance" }} />
      <Stack.Screen name="ChapterBranding" component={ChapterBrandingScreen} options={{ title: "Chapter Branding" }} />
    </Stack.Navigator>
    </>
  );
}
