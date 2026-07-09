// src/navigation/AppNavigator.tsx
//
// Full authenticated app: bottom tab navigator (5 tabs for members,
// 6 for Officer+) nested inside a shared stack for screens accessible
// from any tab (EventDetail, CheckIn, ChannelMessages, etc.).
//
// Integration points:
//   · usePermissions.ts — canViewAdminPanel gates the AdminPanel tab
//   · colors.ts         — primary/accent for header/tab styling
//   · AppStackParamList + MainTabParamList from navigation/types.ts
//   · All screen imports — see imports below. AuditLog and Thread still use
//     NotImplementedScreen — no backend endpoint exists for either yet.

import React from "react";
import { Text } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { usePermissions } from "../hooks/usePermissions";
import { useModulesStore } from "../store/useModulesStore";
import { colors } from "../theme/colors";
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

const Stack = createNativeStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ── Tab bar icons (text fallback; swap for an icon library) ──────────────
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    HomeDashboard: "⌂",
    EventsFeed: "◷",
    Messaging: "✉",
    Leaderboard: "★",
    Profile: "○",
    AdminPanel: "⚙",
  };
  return (
    <Text style={{ fontSize: 20, color: focused ? colors.accent : colors.textMuted }}>
      {icons[label] ?? "•"}
    </Text>
  );
}

function MainTabs() {
  const { canViewAdminPanel } = usePermissions();
  const isMessagingEnabled = useModulesStore((s) => s.isEnabled("messaging"));
  const isPointsEnabled = useModulesStore((s) => s.isEnabled("points"));

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.primaryText,
        headerTitleStyle: { fontWeight: "700" },
      })}
    >
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
      {/*
        Messaging/Leaderboard tabs are always declared (same fixed-tab-count
        rationale as AdminPanel below) but hide their button when their
        module is disabled via Chapter Settings > Modules.
      */}
      <Tab.Screen
        name="Messaging"
        component={MessagingScreen}
        options={{
          title: "Messages",
          tabBarButton: isMessagingEnabled ? undefined : () => null,
        }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{
          title: "Points",
          tabBarButton: isPointsEnabled ? undefined : () => null,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "Profile" }}
      />
      {/*
        AdminPanel is always declared so the tab list length never changes
        at runtime (changing tab count mid-session causes React Navigation
        warnings and index corruption). We hide the tab bar button for
        non-Officers instead of conditionally rendering the screen.
      */}
      <Tab.Screen
        name="AdminPanel"
        component={AdminPanelScreen}
        options={{
          title: "Admin",
          // Hide the button entirely for non-officers — the screen is still
          // accessible via navigation.navigate("AdminPanel") if somehow
          // reached, but AdminPanelScreen itself gates its own content.
          tabBarButton: canViewAdminPanel ? undefined : () => null,
          tabBarStyle: canViewAdminPanel
            ? { backgroundColor: colors.surface, borderTopColor: colors.border }
            : { display: "none" },
        }}
      />
    </Tab.Navigator>
  );
}

// ── App stack — shared screens accessible from any tab ───────────────────
export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.primaryText,
        headerTitleStyle: { fontWeight: "700" },
        headerBackTitle: "",
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
      <Stack.Screen name="AuditLog" component={NotImplementedScreen} options={{ title: "Audit Log" }} />
      <Stack.Screen name="PointsAdjust" component={PointsAdjustScreen} options={{ title: "Adjust Points" }} />
      <Stack.Screen name="RosterDetail" component={RosterDetailScreen} options={{ title: "Roster" }} />
      <Stack.Screen name="DuesDetail" component={DuesDetailScreen} options={{ title: "Dues" }} />

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
    </Stack.Navigator>
  );
}
