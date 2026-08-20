# ChapterHub — What to Test

A quick tour of everything that's built, where to find it, and who can use it.
Read the **Demo Mode vs. Real Account** section first — it changes what you
should expect to work.

---

## Demo Mode vs. Real Account

ChapterHub can run two ways, and they look almost identical:

- **Demo Mode** — no login, drops you straight into a fake chapter with 14
  mock members and sample data. A banner on the Profile tab lets you switch
  between four sample users (one per role) to see what each role sees. Great
  for a fast tour, but a few screens here are **previews that don't talk to a
  real server yet** — flagged explicitly below.
- **Real Account** — you signed up or logged in for real, against the actual
  chapter database. This is where a bug report actually means something.

**If you're not sure which one you're looking at:** check the Profile tab. A
"Demo Mode — viewing as ___" banner at the top means you're in Demo Mode.

---

## Roles, at a glance

| Role | What they generally see |
|---|---|
| **PNM** (prospective member) | View events, view documents, post messages |
| **Alumni** | Same as PNM |
| **Member** | All of the above + take their own attendance, full messaging |
| **Exec** | All of the above + create/edit events, manage attendance, award points, manage committees/dues/documents |
| **Super Admin** | Everything, unrestricted, plus Chapter Settings/Modules/Permissions |

A Super Admin can also customize exactly what each role can do — so what you
see may not match this table exactly if it's been edited.

---

## The main tabs

**Home** · **Events** · **Messages** · **Leaderboard** · **Profile** · **Admin** *(Exec+ only)*

---

## Feature walkthroughs

### 1. Getting in
Sign up (email/password), or **Google**/**Apple** sign-in. New accounts verify
their email, then land on **Join a Chapter** — either enter an invite code
(including tapping a `chapterhub://join?...` link) or browse chapters and
request to join, which an Exec/Super Admin approves.
**Try this:** create an account, then try both the invite-code path and the
request-to-join path.

### 2. Home Dashboard
Upcoming events, your points total + rank, dues status, and a pinned
announcement, all in one glance.

### 3. Events
Browse by category, filter to "Required only," tap in for full details.
Exec+ can create/edit events (the **+** button), scoped to their committee
unless they're Exec (chapter-wide).
**Try this:** RSVP Going/Maybe/Not Going and confirm it updates instantly.

### 4. Attendance & Check-In
Two sides of the same feature: the organizer opens **Check-In** to display a
QR code that rotates every 55 seconds; a member opens **Check-In** on their
own phone to scan it with the camera. Exec+ can also manually mark/remove
attendance with a reason (Attendance Override), which awards/removes points.

### 5. Points & Leaderboard
Every check-in and manual adjustment shows up here. Top 3 get rank badges.
Exec+ can award or deduct points by hand (with a reason) from a member's
profile.

### 6. Messaging
Channels: **#general** (everyone reads, Exec+ posts), **#officers**
(Exec+ only), one per committee, plus direct messages. Officers can pin
messages and reply in a single-level thread.
**Try this:** send a DM to another test account and confirm only the two of
you can see it.

### 7. Committees
Roster, chair, and a dedicated channel per committee. Chairs can edit their
own committee and manage its members even without being Exec.

### 8. Dues
Members see their own status (Paid/Partial/Unpaid/Waived) on Profile and
Home. Exec+ can initialize a semester's dues, record a payment (cash/Venmo/
check/other), or waive someone's balance from the Dues screen.

### 9. Documents & Links
Profile → **Documents** — chapter files by category (Constitution, Bylaws,
Meeting Minutes, Recruitment, Forms, Officer Resources) plus external links.
Exec+ can upload/add and delete.

### 10. Calendar
From any event: add it to your phone's actual calendar app, or use a
Google/Outlook web link or ICS export.

### 11. Feedback & Bug Reports
Profile → **Feedback** — this is the real, working way to report what you
find (see "How to report a bug" below). Exec+ can view/manage everyone's
reports from the Admin panel.

### 12. My Family (Big/Little) & Role Numbers
Profile → **My Family** shows your Big and any Littles (read-only). An
Exec/Super Admin assigns Bigs and role numbers from a member's profile
(Admin → Roster → tap a member → **Manage Member**).

### 13. Settings *(everyone — Profile → Settings)*
A single hub for personal and chapter configuration.
- **Theme** — System / Light / Dark. "System" follows your iPhone's setting
  (including its schedule); Light and Dark override it. Saved on your device
  only, so it never changes what anyone else sees.
- **Chapter Branding** *(admins)* — set the chapter's primary and accent
  colors, name, letters, and logo mark, with six one-tap presets. Every edit
  previews live across the whole app before you save. Text and icon colors on
  top of your colors are picked automatically for contrast, and the screen
  reports the resulting WCAG ratios for both Light and Dark.
- Account, membership, and chapter-administration shortcuts all live here too.

**Try this:** open Settings → Theme, switch to Dark, tap Back. The Settings
screen should be exactly where you left it, in the new colors — no reload,
no jump.

### 14. Invite codes *(Exec+/Super Admin)*
Full lifecycle from Settings → Invite Codes (or Admin → Invite Members):
create, edit, pause, archive, restore, and regenerate. Each code shows its
state (Active / Expiring soon / Expired / Use limit reached / Paused /
Archived), usage count, expiry, and a scannable QR while it's still valid.
Archived codes stay visible under "Show archived" and can be restored.
**Try this:** regenerate a code — the confirmation spells out that the old
code and any printed links stop working immediately.

### 15. Admin tools *(Exec+/Super Admin, under the Admin tab)*
- **Roster** — full member list, tap in for details
- **Invites & Join Requests** — generate invite codes/links, approve or deny
  pending requests
- **Permissions** *(Super Admin only)* — toggle exactly what each role can do
- **Modules** *(Super Admin only)* — turn whole features on/off chapter-wide
- **Chapter Settings** *(Super Admin only)* — chapter name, semester dates,
  default dues amount, attendance points
- **Audit Log** — every privileged action (role changes, dues payments, point
  adjustments, permission edits), with who/what/when

---

## ⚠️ Demo Mode-only previews

These are fully built and interactive **in Demo Mode**, but the real backend
doesn't have them wired up yet — expect an error if you hit these while
signed into a **real account**. Please don't file bugs for these; they're
known and intentional at this stage:

- **Teams** (gamification groups + team leaderboard, distinct from committees)
- **Committee Budgets & Expense Reimbursement**
- **Event check-in delegation** (handing off QR-generation to a co-organizer)
- **Pyli self-service dues payment** (a member paying their own dues directly,
  without an officer recording it)
- **Chapter Branding** (the colors/name/logo editor). Against a real account
  the app falls back to the stock ChapterHub palette instead of erroring.
- **Invite code restore and regenerate.** Create, edit, and archive already
  exist on the server; those two are Demo Mode only for now.

---

## Known gaps (not built yet — also not bugs)

- **Thread** (tapping deeper into a message thread) shows a plain "not
  available" screen — no screen links to it currently anyway.
- **Map view** shows the event's address and an "Open in Maps" link, not an
  embedded map.
- **Push notifications** — nothing sends yet; you won't get a notification
  for new events/messages.
- **Office Inventory** and **Attendance Raffles** — listed in Admin →
  Modules as "coming soon," no screens exist yet.
- **Logo image upload** — Chapter Branding accepts a hosted image URL and a
  logo mark, but there's no file picker/storage yet.

---

## How to report what you find

Use **Profile → Feedback** in the app (works against the real backend) —
pick Bug / Feature Request / General, and include:
- Which **role** you were testing as
- Which **screen/tab** you were on
- **Steps** to reproduce, and what you expected vs. what happened

Exec+ testers can see everyone's submitted reports from Admin → Feedback.
