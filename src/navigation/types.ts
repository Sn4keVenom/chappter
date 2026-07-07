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

export type AuthStackParamList = {
  Login: undefined;
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

  // Admin screens
  AuditLog: undefined;
  PointsAdjust: { userId: string; userName: string };
  RosterDetail: undefined;

  // Dues management
  DuesDetail: { userId: string; userName: string };
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};
