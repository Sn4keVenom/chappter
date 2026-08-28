# Chappter — Test Plan

**Scope:** Backend API, Mobile screens & stores, End-to-end user workflows  
**Testing approach:** Manual for MVP; structure is designed for future Jest/Supertest/Detox automation

---

## Backend Tests

### Setup for all backend tests

```bash
# Create a test database
createdb chappter_test

# Set test env
DATABASE_URL="postgresql://chappter:changeme@localhost:5432/chappter_test"
NODE_ENV="test"

# Migrate test DB
npx prisma migrate deploy

# Seed baseline data
npm run db:seed
```

For manual API testing, use the [Bruno](https://usebruno.com) or Postman collection (create one from the routes below). Get a real JWT from the mobile app (log `jwt` in `AuthNavigator.tsx` after `getToken()`), then add `Authorization: Bearer <jwt>` to all requests.

---

### BE-AUTH — Authentication

**BE-AUTH-01: Sync new user**
- Preconditions: Fresh DB, valid Clerk account
- Steps: `POST /api/v1/auth/sync` with valid JWT and `{ firstName, lastName, email }`
- Expected: 200, returns `{ user: { id, role: "MEMBER", committeeChairOf: [] } }`

**BE-AUTH-02: Sync existing user (profile update)**
- Preconditions: User already exists in DB
- Steps: `POST /auth/sync` with updated `firstName`
- Expected: 200, `firstName` updated, role unchanged

**BE-AUTH-03: Missing auth header**
- Steps: `POST /auth/sync` with no `Authorization` header
- Expected: 401, `{ error: "Missing authorization header" }`

**BE-AUTH-04: Expired/invalid JWT**
- Steps: `POST /auth/sync` with malformed token
- Expected: 401, `{ error: "Invalid token" }`

**BE-AUTH-05: Single-name Google account (lastName empty)**
- Steps: `POST /auth/sync` with `lastName: ""`
- Expected: 200 (fixed: `z.string().min(0)` — previously returned 400)

**BE-AUTH-06: Protected route without sync**
- Steps: Valid JWT but no User row in DB → `GET /users/me`
- Expected: 401, `{ error: "User not provisioned", code: "NEEDS_SYNC" }`

---

### BE-EVENTS — Events

**BE-EVT-01: List published events**
- Preconditions: 2 PUBLISHED events, 1 DRAFT event in DB
- Steps: `GET /api/v1/events`
- Expected: Returns 2 events, not the DRAFT; each has `myRsvpStatus: null`, `myAttendance: null`

**BE-EVT-02: List events filtered by date**
- Steps: `GET /events?from=2026-09-01T00:00:00Z&to=2026-09-30T23:59:59Z`
- Expected: Only events in September

**BE-EVT-03: Get single event**
- Steps: `GET /events/:id` with valid id
- Expected: Full event detail with `checkedInCount`, `checkInWindowStart`, `myRsvpStatus`

**BE-EVT-04: Get single event not found**
- Steps: `GET /events/nonexistent-id`
- Expected: 404

**BE-EVT-05: Get DRAFT event as member**
- Preconditions: User role is MEMBER
- Steps: `GET /events/:id` where event.status is DRAFT
- Expected: 404 (members cannot see drafts)

**BE-EVT-06: Create event as Officer (own committee)**
- Preconditions: User is CHAIR of committeeId = "comm-abc"
- Steps: `POST /events` with `committeeId: "comm-abc"`
- Expected: 201, event created with `status: "PUBLISHED"`

**BE-EVT-07: Create chapter-wide event as Member**
- Preconditions: User role is MEMBER
- Steps: `POST /events` with `committeeId: null`
- Expected: 403

**BE-EVT-08: RSVP to event**
- Steps: `POST /events/:id/rsvp` with `{ status: "GOING" }`
- Expected: 200, `{ rsvp: { status: "GOING" } }`

**BE-EVT-09: Change RSVP**
- Steps: Send `POST /events/:id/rsvp` twice with different statuses
- Expected: Second upsert succeeds; DB has one row with latest status

**BE-EVT-10: Duplicate check-in (idempotent)**
- Preconditions: Attendance record already exists for this user/event
- Steps: `POST /events/:id/checkin` with valid QR token
- Expected: 200, `{ attendance: {...}, alreadyCheckedIn: true }` — no duplicate points

**BE-EVT-11: Check-in with expired token**
- Steps: `POST /events/:id/checkin` with token whose timestamp is in the past
- Expected: 400, `{ error: "Check-in code expired or invalid..." }`

---

### BE-ATTENDANCE — Attendance & Points

**BE-ATT-01: View own attendance history (no filter)**
- Steps: `GET /attendance/history`
- Expected: Returns records newest-first; `records[0].event.title` is populated

**BE-ATT-02: View attendance history filtered by semesterId**
- Steps: `GET /attendance/history?semesterId=<id>`
- Expected: Only attendance for events whose ledger entries match that semester

**BE-ATT-03: Manual mark present (Officer)**
- Preconditions: User is Officer/Chair of the event's committee; no existing attendance
- Steps: `POST /events/:eventId/attendance/:userId` with `{ action: "mark_present", overrideReason: "Forgot phone" }`
- Expected: 201, Attendance row created; PointsLedger entry created; AuditLog row created (in same transaction)

**BE-ATT-04: Manual mark present — already attended**
- Preconditions: Attendance record exists
- Steps: `POST /events/:eventId/attendance/:userId` with action mark_present
- Expected: 409, `{ error: "Attendance already recorded" }`

**BE-ATT-05: Manual remove attendance**
- Preconditions: Attendance record exists with `pointsAwarded: 5`
- Steps: `POST /events/:eventId/attendance/:userId` with `{ action: "remove", overrideReason: "Error" }`
- Expected: Attendance deleted; correcting PointsLedger entry with `amount: -5` created; audit log created

**BE-ATT-06: Leaderboard returns all active members**
- Steps: `GET /points/leaderboard`
- Expected: All ACTIVE users appear; users with no ledger entries have `total: 0`; sorted descending

**BE-ATT-07: Points adjust (Exec+)**
- Steps: `POST /points/adjust` with `{ userId, semesterId, amount: 10, type: "BONUS", reason: "Leadership" }`
- Expected: 201, new PointsLedger entry; next leaderboard reflects the bonus

---

### BE-COMMITTEES — Committees

**BE-COM-01: Create committee (Exec+)**
- Steps: `POST /committees` with `{ name: "Service", description: "..." }`
- Expected: 201; Committee, Channel (COMMITTEE type), CommitteeMembership (CHAIR), and ChannelMembership (ADMIN) created atomically

**BE-COM-02: Create committee as Member**
- Steps: Same request with Member role
- Expected: 403

**BE-COM-03: Get committee detail**
- Steps: `GET /committees/:id`
- Expected: `{ committee: { id, name, channelId, memberCount, members: [...] } }` — `members` array not `memberships`

**BE-COM-04: Add member to committee**
- Steps: `POST /committees/:id/members` with `{ userId, role: "MEMBER" }`
- Expected: 200; CommitteeMembership and ChannelMembership both created

**BE-COM-05: Remove member**
- Steps: `DELETE /committees/:id/members/:userId`
- Expected: 200; membership deleted; channel access removed; past messages preserved

**BE-COM-06: Chair edits own committee**
- Preconditions: User is CHAIR of the committee
- Steps: `PATCH /committees/:id` with `{ description: "Updated" }`
- Expected: 200

**BE-COM-07: Member tries to edit committee**
- Preconditions: User is a MEMBER (not CHAIR)
- Steps: `PATCH /committees/:id`
- Expected: 403

---

### BE-MESSAGING — Messages

**BE-MSG-01: List channels (member)**
- Steps: `GET /channels`
- Expected: Returns GENERAL channel (all see it); OFFICERS channel only for Officer+; committee channels only for members of those committees

**BE-MSG-02: Send message to GENERAL (Member)**
- Steps: `POST /channels/<general-id>/messages` with `{ content: "Hello" }`
- Expected: 403 (members cannot post to GENERAL; only read)

**BE-MSG-03: Send message to GENERAL (Exec)**
- Steps: Same with Exec role
- Expected: 201, message created

**BE-MSG-04: Thread reply**
- Steps: `POST /channels/:id/messages` with `{ content: "Reply", parentMessageId: "<msg-id>" }`
- Expected: 201, message created with parentMessageId set

**BE-MSG-05: Nested thread (rejected)**
- Steps: `POST /channels/:id/messages` with `parentMessageId` pointing to a message that itself has a `parentMessageId`
- Expected: 400, `{ error: "Threads cannot be nested" }`

**BE-MSG-06: Pin message (Officer+)**
- Steps: `PATCH /messages/:id/pin` with `{ pinned: true }`
- Expected: 200; AuditLog row created

**BE-MSG-07: Pin message (Member)**
- Steps: Same with Member role
- Expected: 403

**BE-MSG-08: Soft delete own message**
- Steps: `DELETE /messages/:id` where sender matches caller
- Expected: 200; `deletedAt` set; message excluded from future GET /channels/:id/messages

---

### BE-DUES — Dues

**BE-DUE-01: Initialize semester dues**
- Preconditions: Semester row exists; 5 ACTIVE users
- Steps: `POST /dues/initialize` with `{ semesterId, amountOwed: 150 }`
- Expected: 200, `{ created: 5 }`; 5 DuesRecord rows with status UNPAID

**BE-DUE-02: Initialize twice (idempotent)**
- Steps: Call POST /dues/initialize twice with same semesterId
- Expected: Second call returns `{ created: 0 }` (skipDuplicates)

**BE-DUE-03: Record manual payment**
- Preconditions: DuesRecord exists with amountOwed=150, amountPaid=0
- Steps: `POST /dues/:userId/payment` with `{ semesterId, amount: 75, method: "CASH" }`
- Expected: 201; amountPaid=75; status=PARTIAL; AuditLog created

**BE-DUE-04: Record full payment**
- Steps: Record 75 + 75 (two payments)
- Expected: status=PAID after second payment

**BE-DUE-05: Waive dues**
- Steps: `POST /dues/:userId/waive` with `{ semesterId, reason: "Financial hardship" }`
- Expected: status=WAIVED; calling recalcDuesStatus afterwards has no effect

**BE-DUE-06: Payment on waived record**
- Preconditions: DuesRecord.status = WAIVED
- Steps: `POST /dues/:userId/payment`
- Expected: 400, `{ error: "Dues are waived — no payment needed" }`

**BE-DUE-07: Stripe webhook — valid signature**
- Preconditions: `STRIPE_WEBHOOK_SECRET` configured; local Stripe CLI forwarding active
- Steps: Trigger `payment_intent.succeeded` via Stripe CLI
- Expected: Payment row created; status recalculated; second delivery is no-op (idempotent)

**BE-DUE-08: Dues endpoint without auth (regression test for SEC-01)**
- Steps: `GET /dues/me` with no Authorization header
- Expected: 401 (not a crash; confirms the fix is in place)

---

## Mobile Tests

### Setup

Run the app on a physical device or simulator connected to the backend.

---

### MOB-NAV — Navigation

**MOB-NAV-01: Cold start routes to Login**
- Preconditions: No active session
- Steps: Open app
- Expected: Login screen visible immediately (no spinner hang)

**MOB-NAV-02: Successful login routes to Home Dashboard**
- Steps: Complete Google OAuth
- Expected: Home Dashboard tab visible; no error state

**MOB-NAV-03: Admin tab visibility (Member)**
- Preconditions: Logged in as MEMBER
- Expected: Admin tab not visible in tab bar

**MOB-NAV-04: Admin tab visibility (Officer)**
- Preconditions: Logged in as OFFICER
- Expected: Admin tab visible

**MOB-NAV-05: Deep navigate to event detail**
- Steps: Tap event in feed
- Expected: EventDetail screen loads with RSVP state and event info

**MOB-NAV-06: Back navigation from event detail**
- Steps: Navigate to EventDetail, press back
- Expected: Returns to EventsFeed, feed state preserved

---

### MOB-STORES — Zustand Stores

**MOB-STORE-01: useEventsStore — fetchEvents populates state**
- Steps: Open Events tab
- Expected: `useEventsStore.getState().events` is non-empty; no `loading` stuck at true

**MOB-STORE-02: useEventsStore — optimistic RSVP update**
- Steps: RSVP to event in EventDetail; note the RSVP state
- Expected: `events` array in store updated immediately; EventsFeed shows updated RSVP badge without refresh

**MOB-STORE-03: useMessagesStore — optimistic send**
- Steps: Send a message in ChannelMessages; observe before server response
- Expected: Message appears immediately with user's name on correct side (right bubble); confirmed after ~1s

**MOB-STORE-04: usePointsStore — split loading flags**
- Steps: Navigate to Leaderboard while ProfileScreen is also mounted
- Expected: No loading state race; both screens show data correctly

**MOB-STORE-05: useAuthStore — sign out clears state**
- Steps: Profile → Sign out
- Expected: `useAuthStore.getState().user` is null; navigate back to Login screen

---

### MOB-SCREENS — Screen Smoke Tests

**MOB-SCR-01: HomeDashboardScreen loads**
- Expected: Points card, Dues card (or null state), upcoming events section all render without crash
- Check: No blank white areas; pull-to-refresh works

**MOB-SCR-02: EventsFeedScreen filter chips**
- Steps: Tap "Required only" toggle; tap a category chip
- Expected: Feed filters correctly; events not matching filter disappear

**MOB-SCR-03: CreateEventScreen (Officer)**
- Steps: Open create form; fill all required fields; submit
- Expected: 201 from backend; returns to feed; new event visible

**MOB-SCR-04: CheckInScreen — Officer mode**
- Steps: Open as Officer/Exec for a committee event
- Expected: QR code rendered; timer shows countdown; refreshes at 55s

**MOB-SCR-05: CheckInScreen — Member mode**
- Steps: Open as Member; allow camera permission
- Expected: Camera viewfinder opens; scan frame visible

**MOB-SCR-06: MessagingScreen channel list**
- Expected: GENERAL and OFFICERS channels visible for Officer; only GENERAL for Member

**MOB-SCR-07: ChannelMessagesScreen**
- Steps: Open a channel; type a message; send
- Expected: Message appears immediately; server confirms

**MOB-SCR-08: ProfileScreen loads**
- Expected: Name, role, dues status, recent attendance rendered

**MOB-SCR-09: CommitteeDetailScreen — Chair view**
- Preconditions: Logged in as committee chair
- Steps: Navigate to committee
- Expected: "Edit" button visible; member list shows; Add button visible

**MOB-SCR-10: AttendanceOverrideScreen**
- Preconditions: Logged in as Officer/Exec
- Steps: EventDetail → Attendance → override screen
- Expected: Roster with check-in status; "✓ Mark" and "✕ Remove" buttons

---

## End-to-End Workflows

### E2E-A — Member Workflow

**Preconditions:** One MEMBER account, one existing published event, one Exec account that has initialized dues

**Steps and expected results:**

| # | Action | Expected |
|---|---|---|
| 1 | Open app (no session) | Login screen |
| 2 | Tap "Continue with Google" | OAuth sheet opens |
| 3 | Complete Google sign-in | Home Dashboard |
| 4 | See "0 points" | Points card shows 0, Rank #N |
| 5 | Tap Events tab | Events feed loads |
| 6 | Tap an event | Event Detail screen |
| 7 | Tap "Going" | RSVP state updates immediately |
| 8 | Return to feed | Event shows "Going" badge |
| 9 | Tap Messages tab | Channels list; GENERAL visible |
| 10 | Tap #general | Messages load |
| 11 | Tap Leaderboard | See own name with 0 pts |
| 12 | Tap Profile | Name, role, dues status shown |
| 13 | Tap Sign out | Returned to Login |

---

### E2E-B — Officer Workflow (Event + Check-in)

**Preconditions:** OFFICER account that is CHAIR of "Service" committee; a second MEMBER account; Service committee has a published event

**Steps and expected results:**

| # | Action | Expected |
|---|---|---|
| 1 | Login as Officer | Home Dashboard with Admin tab visible |
| 2 | Events tab → FAB (+) | CreateEvent form |
| 3 | Fill form: title "Service Day", category SERVICE, committeeId = "Service" | |
| 4 | Submit | 201; event appears in feed |
| 5 | Tap the new event | Event Detail with "Check-In" button |
| 6 | Tap Check-In | Officer mode: QR code displayed |
| 7 | [On member phone] Tap Check-In | Member mode: camera opens |
| 8 | Member scans QR | "Checked in!" confirmation |
| 9 | [Back on officer phone] Tap Attendance (Admin tab or Event) | AttendanceOverride screen |
| 10 | See member's name with ✓ | Present status |
| 11 | Tap "✕ Remove" → enter reason → confirm | Member removed; negative ledger entry created |
| 12 | Tap "✓ Mark" → member re-added | Attendance restored with new ledger entry |
| 13 | Open Messages → committee channel | Officers channel visible |

---

### E2E-C — Treasurer (Exec) Dues Workflow

**Preconditions:** EXEC account; Semester row exists; 3 ACTIVE members

**Steps and expected results:**

| # | Action | Expected |
|---|---|---|
| 1 | Login as Exec | Home Dashboard |
| 2 | Admin tab → Dues Overview | Navigates to DuesDetail (currently stub) |
| 3 | [Via API] `POST /dues/initialize` | 3 DuesRecords created, all UNPAID |
| 4 | [Via API] `GET /dues?semesterId=<id>` | Summary shows 3 UNPAID |
| 5 | [Via API] `POST /dues/:userId/payment` with amount=150 | Status → PAID |
| 6 | [Via API] `GET /dues/me` as the paying member | amountPaid: 150, status: PAID |
| 7 | [Via API] `POST /dues/:userId/waive` for another member | Status → WAIVED |
| 8 | Try recording payment on waived member | 400 "Dues are waived" |
| 9 | [Via API] `POST /dues/reminders/send` | Returns list of UNPAID/PARTIAL members |

> **Note:** DuesDetail screen is currently a stub. Steps 2–9 use the API directly via curl/Postman for MVP testing.

---

### E2E-D — Regression: SEC-01 Authentication Fix

| # | Action | Expected |
|---|---|---|
| 1 | `curl http://localhost:4000/api/v1/dues/me` (no auth) | 401, not a crash |
| 2 | `curl http://localhost:4000/api/v1/dues` (no auth) | 401 |
| 3 | Valid JWT + `GET /dues/me` | 200, returns user's records |
| 4 | Valid JWT + `GET /dues` as Member | 403 (not authorized) |
| 5 | Valid JWT + `GET /dues` as Exec | 200, returns all records |

---

## Known Gaps (No Test Currently Possible)

| Area | Gap | Resolution |
|---|---|---|
| Push notifications | No implementation | Phase 4 |
| CSV export | No implementation | Phase 4 |
| Stripe payment E2E | Requires Stripe CLI + ngrok | Test locally with `stripe listen` |
| MemberProfile screen | Stub renders null | Phase 4 |
| AuditLog screen | Stub renders null | Phase 4 |
| Thread screen | Stub renders null | Phase 4 |

---

## Recommended Test Automation Path (Post-Beta)

1. **Backend:** Jest + Supertest with a test PostgreSQL DB. Run `prisma migrate reset` in `beforeAll`.
2. **Mobile stores:** Jest with mocked API calls (`jest.mock('../api/events')`).
3. **E2E:** Detox with a dedicated test Clerk application and test Stripe account.

Priority order: BE-AUTH → BE-DUES (regression for SEC-01) → BE-EVENTS → E2E-A → E2E-B → E2E-C.
