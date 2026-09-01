// src/routes/router.tsx
//
// The complete route map. Every destination has a real URL, so refresh,
// browser Back/Forward, bookmarking, and deep links all work — none of which
// the React Navigation stack could offer.
//
// Routes are code-split with React Router's `lazy`: the shell, the theme, and
// the mock API are in the initial bundle; each page arrives when it's first
// visited. Admin pages in particular are dead weight for the majority of
// users who will never open them.
//
// URL design mirrors the app's information architecture rather than the old
// navigator names, e.g. MemberProfileScreen → /members/:userId.

import { createBrowserRouter } from "react-router-dom";

import AppLayout from "../layouts/AppLayout";
import AuthLayout from "../layouts/AuthLayout";
import { RequireChapter, RequireOnboarding, RequireSignedOut } from "./RootRedirect";
import RouteErrorBoundary from "./RouteErrorBoundary";

/** Terser than repeating the default-export unwrap on every route. */
const page = (loader: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await loader()).default,
});

export const router = createBrowserRouter([
  // Single top-level errorElement covers every branch below — a chunk-load
  // failure or an uncaught render error anywhere in the app lands here
  // instead of React Router's raw default crash page. See
  // RouteErrorBoundary's doc comment for why this is here at all.
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      // ── Signed in, with a chapter ────────────────────────────────────────
      {
        element: <RequireChapter />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, lazy: page(() => import("../pages/HomePage")) },

              // Events
              { path: "events", lazy: page(() => import("../pages/events/EventsPage")) },
              { path: "events/new", lazy: page(() => import("../pages/events/EventFormPage")) },
              { path: "events/:eventId", lazy: page(() => import("../pages/events/EventDetailPage")) },
              { path: "events/:eventId/edit", lazy: page(() => import("../pages/events/EventFormPage")) },
              {
                path: "events/:eventId/check-in",
                lazy: page(() => import("../pages/events/CheckInPage")),
              },
              {
                path: "events/:eventId/attendance",
                lazy: page(() => import("../pages/events/AttendancePage")),
              },

              // Messaging
              { path: "messages", lazy: page(() => import("../pages/messages/MessagesPage")) },
              { path: "messages/:channelId", lazy: page(() => import("../pages/messages/MessagesPage")) },

              // Points
              { path: "points", lazy: page(() => import("../pages/PointsPage")) },
              { path: "teams/:teamId", lazy: page(() => import("../pages/TeamPage")) },

              // Committees
              { path: "committees", lazy: page(() => import("../pages/committees/CommitteesPage")) },
              {
                path: "committees/:committeeId",
                lazy: page(() => import("../pages/committees/CommitteeDetailPage")),
              },
              {
                path: "committees/:committeeId/expense",
                lazy: page(() => import("../pages/committees/SubmitExpensePage")),
              },

              // Documents
              { path: "documents", lazy: page(() => import("../pages/documents/DocumentsPage")) },
              {
                path: "documents/:category",
                lazy: page(() => import("../pages/documents/DocumentCategoryPage")),
              },

              // People
              { path: "profile", lazy: page(() => import("../pages/profile/ProfilePage")) },
              { path: "profile/edit", lazy: page(() => import("../pages/profile/EditProfilePage")) },
              { path: "family", lazy: page(() => import("../pages/profile/FamilyPage")) },
              { path: "members/:userId", lazy: page(() => import("../pages/profile/MemberProfilePage")) },
              {
                path: "members/:userId/points",
                lazy: page(() => import("../pages/admin/AdjustPointsPage")),
              },

              { path: "feedback", lazy: page(() => import("../pages/FeedbackPage")) },

              // Settings — a nested layout, so moving between sections swaps only
              // the inner panel and never remounts the settings shell.
              {
                path: "settings",
                lazy: page(() => import("../layouts/SettingsLayout")),
                children: [
                  { index: true, lazy: page(() => import("../pages/settings/SettingsHomePage")) },
                  { path: "appearance", lazy: page(() => import("../pages/settings/AppearancePage")) },
                  { path: "branding", lazy: page(() => import("../pages/settings/BrandingPage")) },
                  { path: "chapter", lazy: page(() => import("../pages/settings/ChapterSettingsPage")) },
                  { path: "modules", lazy: page(() => import("../pages/settings/ModulesPage")) },
                  { path: "permissions", lazy: page(() => import("../pages/settings/PermissionsPage")) },
                  { path: "achievements", lazy: page(() => import("../pages/settings/AchievementsPage")) },
                ],
              },

              // Admin
              { path: "admin", lazy: page(() => import("../pages/admin/AdminHomePage")) },
              { path: "admin/roster", lazy: page(() => import("../pages/admin/RosterPage")) },
              { path: "admin/dues", lazy: page(() => import("../pages/admin/DuesPage")) },
              { path: "admin/invites", lazy: page(() => import("../pages/admin/InvitesPage")) },
              { path: "admin/join-requests", lazy: page(() => import("../pages/admin/JoinRequestsPage")) },
              {
                path: "admin/roster-verification",
                lazy: page(() => import("../pages/admin/RosterVerificationPage")),
              },
              { path: "admin/budgets", lazy: page(() => import("../pages/admin/BudgetsPage")) },
              { path: "admin/expenses", lazy: page(() => import("../pages/admin/ExpensesPage")) },
              { path: "admin/feedback", lazy: page(() => import("../pages/admin/FeedbackListPage")) },
              { path: "admin/audit-log", lazy: page(() => import("../pages/admin/AuditLogPage")) },
            ],
          },
        ],
      },

      // ── Signed in, no chapter yet ─────────────────────────────────────────
      {
        element: <RequireOnboarding />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: "join", lazy: page(() => import("../pages/onboarding/JoinChapterPage")) },
              { path: "pending", lazy: page(() => import("../pages/onboarding/PendingApprovalPage")) },
            ],
          },
        ],
      },

      // ── Signed out ─────────────────────────────────────────────────────────
      {
        element: <RequireSignedOut />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: "login", lazy: page(() => import("../pages/auth/LoginPage")) },
              { path: "signup", lazy: page(() => import("../pages/auth/SignUpPage")) },
              { path: "verify-email", lazy: page(() => import("../pages/auth/VerifyEmailPage")) },
              { path: "forgot-password", lazy: page(() => import("../pages/auth/ForgotPasswordPage")) },
              { path: "reset-password", lazy: page(() => import("../pages/auth/ResetPasswordPage")) },
            ],
          },
        ],
      },

      { path: "*", lazy: page(() => import("../pages/NotFoundPage")) },
    ],
  },
]);
