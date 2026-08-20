# ChapterHub — Web Migration

Platform migration from Expo/React Native to a responsive web application.
Mobile web is the primary design target; desktop is a first-class experience.

## What carries over untouched

These layers have zero React Native or Expo coupling and are reused verbatim.
They are the reason this is a frontend migration rather than a rewrite:

| Layer | Files | Notes |
|---|---|---|
| Types + domain helpers | `src/types/index.ts` | `inviteState`, `formatCurrency`, `fullName`, … |
| Permission engine | `src/permissions/permissions.ts` | Same engine the mock API uses server-side |
| API abstraction | `src/api/*.ts` | axios — works unchanged in the browser |
| Mock backend | `src/mocks/*.ts` | axios adapter, seed data, business logic |
| Stores | `src/store/*.ts` | zustand |
| Palette math | `src/theme/{contrast,palette,branding}.ts` | Pure functions |
| Achievements | `src/utils/achievements.ts` | Pure |

The data flow is unchanged:

    Web UI → src/api/*.ts → axios → demo adapter (Demo Mode) or real backend

## What is rebuilt for the web

| Mobile | Web |
|---|---|
| React Navigation stack + bottom tabs | React Router, real URLs |
| `StyleSheet.create` / `makeStyles` proxy | CSS custom properties + CSS Modules |
| `Appearance` + `expo-secure-store` | `matchMedia` + `localStorage` |
| RN `Modal` | `<dialog>`-semantics accessible modal |
| `Pressable` | `<button>` / `<a>` |
| `TextInput` | `<input>` / `<textarea>` |
| `FlatList` / `ScrollView` | Normal document flow + `overflow` |
| `expo-camera` QR scanner | Camera not used; codes entered manually on web |
| `expo-calendar` | ICS download + Google/Outlook links |
| `@clerk/clerk-expo` | Auth adapter with a Clerk-web seam |

## Architecture

**Vite + React 19 + TypeScript + React Router 7.**

Chosen over Next.js deliberately: Demo Mode's whole premise is that the app
runs with no server at all. A Next.js app implies a Node server, server
components, and a build-time/runtime split that the mock axios adapter — which
is inherently client-side — would fight. This app is a signed-in dashboard
with no SEO surface and no server-rendered content, so SSR buys nothing.
Vite gives a fast dev server and a static bundle that can be hosted anywhere.

## Feature parity checklist

Derived from every screen in the Expo app. All items below are migrated and verified in a browser.

### Core
- [x] Home dashboard (announcement, points, dues, upcoming events)
- [x] Events feed (category filters, required-only, upcoming/past)
- [x] Event detail (RSVP, attendance result, delegates, calendar export)
- [x] Create / edit event
- [x] Check-in (officer rotating code; member code entry)
- [x] Attendance override (mark present / remove with reason)
- [x] Leaderboard (individual + team)
- [x] Messaging (channel list + conversation)
- [x] Profile (points, dues, achievements, attendance history, Pyli payment)
- [x] Edit profile
- [x] My Family (Big / Littles)
- [x] Member profile (+ assign Big, role number, adjust points)
- [x] Committee detail (roster, budget, expense submission)
- [x] Team detail
- [x] Documents + document category
- [x] Feedback submission
- [x] Map / location view

### Settings
- [x] Settings hub
- [x] Appearance (System / Light / Dark)
- [x] Chapter branding (colors, name, letters, logo, presets, contrast report)

### Admin
- [x] Admin panel
- [x] Roster detail
- [x] Dues detail (record payment, waive)
- [x] Points adjust
- [x] Audit log
- [x] Invite codes (create/edit/pause/archive/restore/regenerate)
- [x] Join requests
- [x] Permissions editor
- [x] Modules toggles
- [x] Chapter settings
- [x] Committee budgets
- [x] Expense reimbursements
- [x] Feedback list

### Auth / onboarding
- [x] Login
- [x] Sign up
- [x] Verify email
- [x] Forgot / reset password
- [x] Join chapter
- [x] Pending approval

### Cross-cutting
- [x] Role-based navigation (Member / PNM / Alumni / Exec / Super Admin)
- [x] Module-based navigation
- [x] Demo Mode role switcher
- [x] Light / Dark / System theming
- [x] Chapter branding applied app-wide
- [x] Responsive: small mobile → desktop
- [x] Keyboard accessibility + focus states


## Verified in the browser

Chrome, dev server, Demo Mode. Viewports: 320 / 390 / 768 / 1280 / 1440.

- All 28 routes render with the correct `<h1>`, no blanks, no console errors.
- Hard refresh on a deep route (`/admin/invites`), browser Back and Forward
  across `/points → /events → /profile` — all correct.
- Role switching (Member / PNM / Alumni / Super Admin): the bottom bar renders
  5 items for non-admins and 6 for an admin, with no empty slots; the
  Administration section disappears from the drawer; direct URL access to
  `/admin` and `/admin/invites` shows "Access restricted".
- Theme: Light / Dark / System, `data-theme` and CSS variables update,
  preference persists in `localStorage`, brand primary adapts per scheme
  (`#25405E` light → `#2A4562` dark).
- Chapter branding: preset applied, saved, and persisted across navigation
  (`--color-primary` `#2A4562` → `#8E2436` app-wide); reset restored defaults.
- Messaging: message sent through the mock API, appears at the bottom of the
  transcript, composer clears.
- Dialog: focus moves inside on open, `aria-modal`, labelled by its title,
  background scroll locked and released, Escape closes, focus returns to the
  trigger.
- Responsive: roster is cards below 720px and a table above it; sidebar
  appears at 900px and the bottom bar disappears; no horizontal body scroll at
  any width.
