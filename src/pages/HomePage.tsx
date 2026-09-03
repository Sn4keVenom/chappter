// src/pages/HomePage.tsx
//
// Dashboard. On mobile the sections stack in priority order — announcement,
// then this week's events, then the at-a-glance stats. On desktop the layout
// becomes two columns so the stats and quick actions sit alongside rather than
// below the fold.
//
// Data comes from a single GET /users/me/dashboard, unchanged from the mobile
// app — one round trip for everything on the page.

import { useState } from "react";
import { Link } from "react-router-dom";

import { getDashboard, getRoster } from "../api/users";
import { awardBrotherOfWeek, getBrotherOfWeek } from "../api/brotherOfWeek";
import { useAsync } from "../hooks/useAsync";
import { usePermissions } from "../hooks/usePermissions";
import { PageHeader, Section } from "../components/PageHeader";
import { Card, CardLabel, CardLink } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Input } from "../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../components/ui/Feedback";
import { eventCategoryColor, duesStatusTone } from "../theme/semantic";
import { useAuthStore } from "../store/useAuthStore";
import { useModulesStore } from "../store/useModulesStore";
import { formatCurrency } from "../types";
import { formatEventWhen, formatRelativeDays } from "../utils/format";
import type { EventSummary } from "../types";
import styles from "./HomePage.module.css";

/** "There should only be one person with brother of the week, so once it is
 * awarded, it is removed from the previous person" — awarded by Super
 * Admin, Regent/Vice Regent, OR the current holder passing the title on.
 * Self-contained: fetches independently of the main dashboard call so a
 * re-award doesn't need to reload everything else on the page. */
function BrotherOfWeekCard() {
  const { isSuperAdmin, can } = usePermissions();
  const currentUser = useAuthStore((s) => s.user);
  const { data: holder, loading, reload } = useAsync(() => getBrotherOfWeek(), []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAward = isSuperAdmin || can("brotherOfWeek.award") || holder?.id === currentUser?.id;

  const { data: candidates, loading: searching } = useAsync(
    () => (pickerOpen ? getRoster({ q: query, limit: 15 }).then((r) => r.users) : Promise.resolve([])),
    [query, pickerOpen]
  );

  async function award(userId: string) {
    setPickerOpen(false);
    setBusy(true);
    setError(null);
    try {
      await awardBrotherOfWeek(userId);
      await reload({ silent: true });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't award Brother of the Week.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <Card>
      <CardLabel>🏆 Brother of the Week</CardLabel>
      {error ? <ErrorBanner message={error} /> : null}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        {holder ? (
          <>
            <Avatar
              avatarUrl={holder.avatarUrl}
              firstName={holder.firstName}
              lastName={holder.lastName}
              className={styles.botwAvatar}
            />
            <Link to={`/members/${holder.id}`} style={{ fontWeight: 700 }}>
              {holder.firstName} {holder.lastName}
            </Link>
          </>
        ) : (
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No one yet this week.</p>
        )}
      </div>
      {canAward ? (
        <Button
          variant="secondary"
          size="sm"
          block
          busy={busy}
          style={{ marginTop: "var(--space-3)" }}
          onClick={() => setPickerOpen(true)}
        >
          {holder ? "Pass the title on" : "Award it"}
        </Button>
      ) : null}

      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Award Brother of the Week"
        subtitle={holder ? `Replaces ${holder.firstName} ${holder.lastName} as the current holder.` : undefined}
        footer={
          <Button variant="secondary" onClick={() => setPickerOpen(false)}>
            Cancel
          </Button>
        }
      >
        <Input
          label="Search members"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or email"
          autoComplete="off"
          autoFocus
        />
        {searching ? (
          <LoadingState label="Searching…" />
        ) : (
          <div style={{ maxHeight: 280, overflowY: "auto", marginTop: "var(--space-3)" }}>
            {(candidates ?? []).map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "var(--space-2) 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
                onClick={() => award(candidate.id)}
              >
                {candidate.firstName} {candidate.lastName}
              </button>
            ))}
          </div>
        )}
      </Dialog>
    </Card>
  );
}

function EventRow({ event }: { event: EventSummary }) {
  return (
    <CardLink to={`/events/${event.id}`} accentColor={eventCategoryColor(event.category)}>
      <div className={styles.eventRow}>
        <div className={styles.eventBody}>
          <p className={styles.eventTitle}>{event.title}</p>
          <p className={styles.eventMeta}>
            {formatEventWhen(event.startTime)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          {event.myRsvpStatus ? <p className={styles.rsvp}>RSVP: {event.myRsvpStatus}</p> : null}
        </div>
        <div className={styles.eventTags}>
          {event.attendanceRequired ? <Badge tone="danger">Required</Badge> : null}
          <Badge tone="accent">+{event.pointValue}pts</Badge>
        </div>
      </div>
    </CardLink>
  );
}

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const isPointsEnabled = useModulesStore((s) => s.isEnabled("points"));
  const isDuesEnabled = useModulesStore((s) => s.isEnabled("dues"));
  const isEventsEnabled = useModulesStore((s) => s.isEnabled("events"));

  const { data, loading, error, reload } = useAsync(() => getDashboard(), []);

  if (loading) return <div className="page"><LoadingState /></div>;

  const dues = data?.duesRecord;

  return (
    <div className="page">
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? "there"}`}
        subtitle={data?.points.semesterLabel ?? undefined}
      />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}

      <div className={styles.grid}>
        <div className={styles.primaryColumn}>
          {data?.pinnedAnnouncement ? (
            <Card className={styles.announcement}>
              <p className={styles.announcementLabel}>
                <span aria-hidden="true">📌</span> Announcement
              </p>
              <p className={styles.announcementBody}>{data.pinnedAnnouncement.content}</p>
              <p className={styles.announcementMeta}>
                — {data.pinnedAnnouncement.senderName} ·{" "}
                {formatRelativeDays(data.pinnedAnnouncement.createdAt)}
              </p>
            </Card>
          ) : null}

          {isEventsEnabled ? (
            <Section
              title="Upcoming this week"
              actions={
                <Link to="/events" style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>
                  All events ›
                </Link>
              }
            >
              {data && data.upcomingEvents.length > 0 ? (
                <div className={styles.eventList}>
                  {data.upcomingEvents.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <Card>
                  <EmptyState
                    icon="📅"
                    title="Nothing scheduled"
                    body="No chapter events are coming up in the next week."
                  />
                </Card>
              )}
            </Section>
          ) : null}
        </div>

        <div className={styles.sideColumn}>
          <div className={styles.stats}>
            {isPointsEnabled ? (
              <CardLink to="/points" className={styles.stat}>
                <CardLabel>Points</CardLabel>
                <p className={styles.statValue}>{data?.points.total ?? 0}</p>
                <p className={styles.statSub}>
                  {data?.points.rank ? `#${data.points.rank} this semester` : "Unranked"}
                </p>
              </CardLink>
            ) : null}

            {isDuesEnabled ? (
              <CardLink to="/profile" className={styles.stat}>
                <CardLabel>Dues</CardLabel>
                <p className={styles.statValue}>
                  {dues ? (
                    <Badge tone={duesStatusTone(dues.status)} uppercase>
                      {dues.status}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </p>
                <p className={styles.statSub}>
                  {dues
                    ? `${formatCurrency(dues.amountPaid)} / ${formatCurrency(dues.amountOwed)}`
                    : "No dues record"}
                </p>
              </CardLink>
            ) : null}
          </div>

          <BrotherOfWeekCard />

          <Card>
            <CardLabel>Quick actions</CardLabel>
            <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
              <ButtonLink to="/profile" variant="secondary" block>
                View my profile
              </ButtonLink>
              <ButtonLink to="/family" variant="secondary" block>
                My Big &amp; Littles
              </ButtonLink>
              <Button variant="ghost" block onClick={() => reload({ silent: true })}>
                Refresh
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
