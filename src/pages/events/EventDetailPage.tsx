// src/pages/events/EventDetailPage.tsx
//
// Single event: details, RSVP, attendance result, calendar export, and the
// organizer tools (check-in, attendance override, delegate assignment) for
// anyone scoped to manage it.
//
// Desktop splits into two columns — the narrative on the left, the actions
// the page exists for on the right, sticky so they stay reachable while
// reading a long description. Mobile stacks them, actions first-class rather
// than buried below the fold.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  addEventDelegate,
  getEvent,
  removeEventDelegate,
  setRsvp,
} from "../../api/events";
import { getRoster } from "../../api/users";
import {
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  downloadIcs,
  eventToCalendarInput,
} from "../../utils/calendar";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink, ExternalButtonLink } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { eventCategoryColor } from "../../theme/semantic";
import { formatEventWhen, formatTime, titleCaseEnum } from "../../utils/format";
import type { EventDetail, RsvpStatus, UserSummary } from "../../types";
import styles from "./EventDetailPage.module.css";

const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: "GOING", label: "Going" },
  { value: "MAYBE", label: "Maybe" },
  { value: "NOT_GOING", label: "Can't go" },
];

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={styles.detailValue}>{children}</dd>
    </div>
  );
}

function DelegatePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (user: UserSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const { data, loading } = useAsync(
    () => getRoster({ q: query, limit: 15 }).then((r) => r.users),
    [query]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add check-in delegate"
      subtitle="A delegate can generate this event's check-in code without gaining general attendance access."
      footer={
        <Button variant="secondary" onClick={onClose}>
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
      />
      {loading ? (
        <LoadingState label="Searching…" />
      ) : (
        <div className={styles.searchResults}>
          {(data ?? []).map((user) => (
            <button key={user.id} type="button" className={styles.searchRow} onClick={() => onPick(user)}>
              <span className={styles.searchName}>
                {user.firstName} {user.lastName}
              </span>
              <br />
              <span className={styles.searchMeta}>{user.email}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

export default function EventDetailPage() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const { canManageEvent, canGenerateCheckIn } = usePermissions();

  const { data: event, loading, error, reload, setData } = useAsync(() => getEvent(eventId), [eventId]);

  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load this event" body={error ?? undefined} onRetry={() => reload()} />
      </div>
    );
  }

  const past = new Date(event.endTime) < new Date();
  const canManage = canManageEvent(event);
  const canCheckIn = canGenerateCheckIn(event);

  async function handleRsvp(status: RsvpStatus) {
    if (!event) return;
    const previous = event.myRsvpStatus;
    setRsvpBusy(true);
    setActionError(null);
    // Optimistic: the control should respond instantly, and the request is a
    // simple idempotent upsert that we can roll back cleanly if it fails.
    setData({ ...event, myRsvpStatus: status } as EventDetail);
    try {
      await setRsvp(event.id, status);
    } catch (e: any) {
      setData({ ...event, myRsvpStatus: previous } as EventDetail);
      setActionError(e?.message ?? "Couldn't save your RSVP.");
    } finally {
      setRsvpBusy(false);
    }
  }

  const calendarInput = eventToCalendarInput(event);

  return (
    <div className="page">
      <PageHeader
        title={event.title}
        backTo="/events"
        backLabel="Events"
        actions={
          canManage ? (
            <ButtonLink to={`/events/${event.id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
          ) : undefined
        }
      />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <Card accentColor={eventCategoryColor(event.category)}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <Badge tone="neutral" uppercase>
                {titleCaseEnum(event.category)}
              </Badge>
              {event.attendanceRequired ? <Badge tone="danger">Required</Badge> : null}
              <Badge tone="accent">+{event.pointValue} pts</Badge>
              {event.status !== "PUBLISHED" ? (
                <Badge tone="warning" uppercase>
                  {titleCaseEnum(event.status)}
                </Badge>
              ) : null}
            </div>

            <dl>
              <DetailRow label="When">
                {formatEventWhen(event.startTime)} – {formatTime(event.endTime)}
              </DetailRow>
              {event.location ? (
                <DetailRow label="Where">
                  {/* Deep-links to whatever map app the platform prefers. */}
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(event.location)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {event.location}
                  </a>
                </DetailRow>
              ) : null}
              {event.committee ? <DetailRow label="Committee">{event.committee.name}</DetailRow> : null}
              <DetailRow label="Checked in">{event.checkedInCount}</DetailRow>
            </dl>
          </Card>

          {event.description ? (
            <Section title="Details">
              <Card>
                <p className={styles.description}>{event.description}</p>
              </Card>
            </Section>
          ) : null}

          {/* `.length >= 0` was always true for any array, so this only ever
              meant `canManage` — and it threw outright when the backend
              omitted the field entirely (it has no delegates route yet).
              Hide the section when delegation isn't available at all. */}
          {canManage && event.attendanceDelegates ? (
            <Section title="Check-in delegates">
              <Card>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
                  Delegates can display this event's check-in code without
                  gaining attendance access to any other event.
                </p>
                <div className={styles.delegateRow}>
                  {event.attendanceDelegates.map((delegate) => (
                    <span key={delegate.userId} className={styles.delegateChip}>
                      {delegate.firstName} {delegate.lastName}
                      <button
                        type="button"
                        className={styles.delegateRemove}
                        aria-label={`Remove ${delegate.firstName} ${delegate.lastName} as delegate`}
                        onClick={async () => {
                          try {
                            const delegates = await removeEventDelegate(event.id, delegate.userId);
                            setData({ ...event, attendanceDelegates: delegates });
                          } catch (e: any) {
                            setActionError(e?.message ?? "Couldn't remove delegate.");
                          }
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <Button size="sm" variant="secondary" onClick={() => setDelegateOpen(true)}>
                    + Add delegate
                  </Button>
                </div>
              </Card>
            </Section>
          ) : null}
        </div>

        <div className={styles.sideColumn}>
          {past && event.myAttendance ? (
            <Card>
              <CardLabel>Your attendance</CardLabel>
              <div className={styles.resultCard}>
                <span className={styles.resultValue} style={{ color: "var(--color-success)" }}>
                  Attended
                </span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                  +{event.myAttendance.pointsAwarded} points
                  {event.myAttendance.late ? " · marked late" : ""}
                </span>
              </div>
            </Card>
          ) : past ? (
            <Card>
              <CardLabel>Your attendance</CardLabel>
              <div className={styles.resultCard}>
                <span
                  className={styles.resultValue}
                  style={{ color: event.attendanceRequired ? "var(--color-danger)" : "var(--color-text-muted)" }}
                >
                  {event.attendanceRequired ? "Missed" : "Didn't attend"}
                </span>
              </div>
            </Card>
          ) : (
            <Card>
              <CardLabel>Your RSVP</CardLabel>
              <div className={styles.rsvpGroup} role="radiogroup" aria-label="RSVP">
                {RSVP_OPTIONS.map((option) => {
                  const selected = event.myRsvpStatus === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={rsvpBusy}
                      className={[styles.rsvpOption, selected ? styles.rsvpSelected : ""]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleRsvp(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <div className={styles.actions}>
            {canCheckIn ? (
              <ButtonLink to={`/events/${event.id}/check-in`} variant="primary" block>
                Check-in code
              </ButtonLink>
            ) : !past ? (
              <ButtonLink to={`/events/${event.id}/check-in`} variant="primary" block>
                Check in
              </ButtonLink>
            ) : null}

            {canManage ? (
              <ButtonLink to={`/events/${event.id}/attendance`} variant="secondary" block>
                Manage attendance
              </ButtonLink>
            ) : null}

            <Button variant="secondary" block onClick={() => setCalendarOpen(true)}>
              Add to calendar
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        title="Add to calendar"
        subtitle="Choose where to save this event."
        footer={
          <Button variant="secondary" onClick={() => setCalendarOpen(false)}>
            Close
          </Button>
        }
      >
        <div className={styles.actions}>
          <Button
            variant="secondary"
            block
            onClick={() => {
              downloadIcs(calendarInput);
              setCalendarOpen(false);
            }}
          >
            Download .ics (Apple Calendar, Outlook)
          </Button>
          <ExternalButtonLink href={buildGoogleCalendarUrl(calendarInput)} variant="secondary" block>
            Google Calendar
          </ExternalButtonLink>
          <ExternalButtonLink href={buildOutlookCalendarUrl(calendarInput)} variant="secondary" block>
            Outlook Web
          </ExternalButtonLink>
        </div>
      </Dialog>

      <DelegatePicker
        open={delegateOpen}
        onClose={() => setDelegateOpen(false)}
        onPick={async (user) => {
          setDelegateOpen(false);
          try {
            const delegates = await addEventDelegate(event.id, user.id);
            setData({ ...event, attendanceDelegates: delegates });
          } catch (e: any) {
            setActionError(e?.message ?? "Couldn't add delegate.");
          }
        }}
      />
    </div>
  );
}
