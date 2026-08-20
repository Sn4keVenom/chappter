// src/pages/events/EventsPage.tsx
//
// Event feed with tab (upcoming/past), category filter, and a required-only
// toggle. Filter state lives in the URL query string rather than component
// state, so a filtered view can be shared, bookmarked, and restored by Back —
// which the mobile app's local state could not do.

import { useSearchParams } from "react-router-dom";

import { useEventsStore } from "../../store/useEventsStore";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader } from "../../components/PageHeader";
import { CardLink } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { ButtonLink } from "../../components/ui/Button";
import { ChipGroup, SegmentedControl, Switch } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { eventCategoryColor } from "../../theme/semantic";
import { formatEventWhen } from "../../utils/format";
import { useEffect } from "react";
import type { EventCategory, EventSummary } from "../../types";
import styles from "./EventsPage.module.css";

const CATEGORIES: { value: EventCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "BROTHERHOOD", label: "Brotherhood" },
  { value: "SERVICE", label: "Service" },
  { value: "PROFESSIONAL", label: "Professional" },
  { value: "RUSH", label: "Rush" },
  { value: "ADMIN", label: "Admin" },
];

function EventCard({ event }: { event: EventSummary }) {
  const past = new Date(event.endTime) < new Date();

  return (
    <CardLink to={`/events/${event.id}`} accentColor={eventCategoryColor(event.category)}>
      <div className={styles.eventTop}>
        <div className={styles.eventBody}>
          <p className={styles.eventTitle}>{event.title}</p>
          <p className={styles.eventMeta}>
            {formatEventWhen(event.startTime)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          {past && event.myAttendance ? (
            <p className={styles.rsvp}>
              Attended · +{event.myAttendance.pointsAwarded}
              {event.myAttendance.late ? " (late)" : ""}
            </p>
          ) : event.myRsvpStatus ? (
            <p className={styles.rsvp}>RSVP: {event.myRsvpStatus}</p>
          ) : null}
        </div>
        <div className={styles.eventTags}>
          {event.attendanceRequired ? <Badge tone="danger">Required</Badge> : null}
          <Badge tone="accent">+{event.pointValue}pts</Badge>
        </div>
      </div>
    </CardLink>
  );
}

export default function EventsPage() {
  const [params, setParams] = useSearchParams();
  const { events, loading, error, fetchEvents } = useEventsStore();
  const { can } = usePermissions();

  const tab = (params.get("tab") === "past" ? "past" : "upcoming") as "upcoming" | "past";
  const category = (params.get("category") ?? "ALL") as EventCategory | "ALL";
  const requiredOnly = params.get("required") === "1";

  /** Merge one filter change into the query string, dropping defaults. */
  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    // replace, not push: filter tweaks shouldn't each become a Back step.
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const now = new Date().toISOString();
    fetchEvents({
      ...(tab === "upcoming" ? { from: now } : { to: now }),
      ...(category !== "ALL" ? { category } : {}),
    });
  }, [tab, category, fetchEvents]);

  const filtered = events.filter((event) => {
    const isPast = new Date(event.endTime) < new Date();
    if (tab === "upcoming" && isPast) return false;
    if (tab === "past" && !isPast) return false;
    if (requiredOnly && !event.attendanceRequired) return false;
    return true;
  });

  return (
    <div className="page">
      <PageHeader
        title="Events"
        actions={
          can("events.create") ? (
            <ButtonLink to="/events/new" variant="primary">
              + New event
            </ButtonLink>
          ) : undefined
        }
      />

      <div className={styles.filters}>
        <SegmentedControl
          label="Time range"
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
          ]}
          value={tab}
          onChange={(v) => setParam("tab", v === "upcoming" ? null : v)}
          block
        />

        <div className={styles.chipScroller}>
          <ChipGroup
            label="Category"
            options={CATEGORIES}
            isSelected={(v) => category === v}
            onSelect={(v) => setParam("category", v === "ALL" ? null : v)}
          />
        </div>

        <Switch
          checked={requiredOnly}
          onChange={(v) => setParam("required", v ? "1" : null)}
          label="Required events only"
        />
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {loading && events.length === 0 ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📅"
          title={tab === "upcoming" ? "No upcoming events" : "No past events"}
          body={
            requiredOnly
              ? "No events match the required-only filter."
              : "Nothing to show for this filter."
          }
        />
      ) : (
        <div className={styles.list}>
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
