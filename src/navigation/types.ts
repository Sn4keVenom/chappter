// src/navigation/types.ts
//
// Type-safe navigation param lists for every stack/tab in the app.
// Import these into screen components for typed useRoute<RouteProp<...>>
// and into navigator files for typed createNativeStackNavigator.
//
// Integration points:
//   · RootNavigator.tsx — uses RootStackParamList
//   · AuthNavigator.tsx — uses AuthStackParamList
//   · AppNavigator.tsx  — uses MainTabParamList + AppStackParamList
//   · All screen components import their specific param type from here

import type { DocumentCategory } from "../types";

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  VerifyEmail: { email: string; phone?: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

// Shown when the user has an account but hasn't joined a chapter yet (spec
// §2/§3 — never auto-assigned). RootNavigator routes here instead of
// AuthNavigator/AppNavigator based on useAuthStore's hasChapter/
// pendingJoinRequest.
export type OnboardingStackParamList = {
  // code: pre-filled when opened via an invite deep link
  // (chapterhub://join?code=XXXX — see RootNavigator's linking config).
  JoinChapter: { code?: string } | undefined;
  PendingApproval: undefined;
};

export type MainTabParamList = {
  HomeDashboard: undefined;
  EventsFeed: undefined;
  Messaging: undefined;
  Leaderboard: undefined;
  Profile: undefined;
  AdminPanel: undefined; // only rendered for Officer+, see AppNavigator
};

export type AppStackParamList = {
  // Tab screens (mounted inside tab navigator)
  Tabs: { screen?: keyof MainTabParamList };

  // Event screens
  EventDetail: { eventId: string };
  CreateEvent: undefined;
  EditEvent: { eventId: string };
  CheckIn: { eventId: string; mode: "officer" | "member" };
  AttendanceOverride: { eventId: string };
  MapView: { event: { location: string; latitude?: number; longitude?: number } };

  // Messaging screens
  ChannelMessages: { channelId: string; channelName: string };
  Thread: { channelId: string; messageId: string };

  // Committee screens
  CommitteeDetail: { committeeId: string };

  // Member screens
  MemberProfile: { userId: string };
  EditProfile: undefined;
  MyFamily: { userId?: string }; // omitted = self

  // Admin screens
  AuditLog: undefined;
  PointsAdjust: { userId: string; userName: string };
  RosterDetail: undefined;
  ChapterInviteManager: undefined;
  JoinRequests: undefined;

  // Dues management
  DuesDetail: { userId: string; userName: string };

  // Teams (Feature 2)
  TeamDetail: { teamId: string };

  // Committee budgets & reimbursements (Feature 5)
  SubmitExpense: { committeeId: string; committeeName: string };
  Expenses: undefined;
  CommitteeBudgets: undefined;

  // Chapter administration (Super Admin only — spec §4/§5/§6)
  ChapterSettings: undefined;
  Modules: undefined;
  Permissions: undefined;

  // Documents & external links (spec §8)
  Documents: undefined;
  DocumentCategory: { category: DocumentCategory; label: string };

  // Feedback & bug reports (spec §9)
  Feedback: undefined;
  FeedbackList: undefined;

  // Settings hub and its submenus. On the shared app stack rather than a tab,
  // so Settings → submenu → back is a plain push/pop that preserves the
  // Settings screen instance instead of remounting it.
  Settings: undefined;
  Appearance: undefined;
  ChapterBranding: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  App: undefined;
};
