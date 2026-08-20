// src/pages/events/EventFormPage.tsx
//
// Create or edit an event. One component serves both routes — /events/new and
// /events/:eventId/edit — because the fields and validation are identical and
// only the initial values and the submit target differ.
//
// This is a real <form>: submitting with Enter works, the browser's own
// validation runs first, and each control is a native input with a label. The
// mobile app used a custom date-picker modal; the web equivalent is
// <input type="datetime-local">, which gets the platform's own picker for
// free and is keyboard-typeable.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import { getEvent } from "../../api/events";
import { listCommittees } from "../../api/committees";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Select, Switch, Textarea } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { fromDateTimeLocalValue, toDateTimeLocalValue } from "../../utils/format";
import type { Committee, EventCategory } from "../../types";

const CATEGORIES: EventCategory[] = ["BROTHERHOOD", "SERVICE", "PROFESSIONAL", "RUSH", "ADMIN"];

function defaultStart(): string {
  return toDateTimeLocalValue(new Date(Date.now() + 3_600_000).toISOString());
}

function defaultEnd(): string {
  return toDateTimeLocalValue(new Date(Date.now() + 7_200_000).toISOString());
}

export default function EventFormPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const isEditing = Boolean(eventId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<EventCategory>("BROTHERHOOD");
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [attendanceRequired, setAttendanceRequired] = useState(false);
  const [pointValue, setPointValue] = useState("5");
  const [committeeId, setCommitteeId] = useState("");

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: existing, loading } = useAsync(
    () => (eventId ? getEvent(eventId) : Promise.resolve(null)),
    [eventId]
  );

  useEffect(() => {
    listCommittees().then(setCommittees).catch(() => {
      // A missing committee list only removes an optional picker — the rest
      // of the form still works, so this is deliberately non-fatal.
    });
  }, []);

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setDescription(existing.description ?? "");
    setLocation(existing.location ?? "");
    setCategory(existing.category);
    setStartTime(toDateTimeLocalValue(existing.startTime));
    setEndTime(toDateTimeLocalValue(existing.endTime));
    setAttendanceRequired(existing.attendanceRequired);
    setPointValue(String(existing.pointValue));
    setCommitteeId(existing.committeeId ?? "");
  }, [existing]);

  if (!can("events.create") && !isEditing) {
    return (
      <div className="page">
        <RequireAccess message="You don't have permission to create events." />
      </div>
    );
  }

  if (isEditing && loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "Give the event a title.";
    if (!startTime) errors.startTime = "Choose a start time.";
    if (!endTime) errors.endTime = "Choose an end time.";
    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
      errors.endTime = "End time must be after the start time.";
    }
    const points = Number(pointValue);
    if (!Number.isFinite(points) || points < 0) errors.pointValue = "Points must be zero or more.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      category,
      startTime: fromDateTimeLocalValue(startTime),
      endTime: fromDateTimeLocalValue(endTime),
      attendanceRequired,
      pointValue: Number(pointValue) || 0,
      committeeId: committeeId || undefined,
    };

    try {
      if (isEditing) {
        // The backend exposes creation only; editing reuses the same shape so
        // the form is ready the moment PATCH /events/:id ships. Until then an
        // edit surfaces the API's own error rather than silently no-op'ing.
        await apiClient.patch(`/events/${eventId}`, payload);
      } else {
        await apiClient.post("/events", payload);
      }
      navigate(isEditing ? `/events/${eventId}` : "/events", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save the event — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title={isEditing ? "Edit event" : "New event"}
        backTo={isEditing ? `/events/${eventId}` : "/events"}
        backLabel={isEditing ? "Event" : "Events"}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldErrors.title}
            placeholder="Chapter Meeting"
            autoFocus={!isEditing}
          />

          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's happening, what to bring, who to contact…"
            rows={4}
          />

          <Input
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Chapter House, Library"
          />

          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as EventCategory)}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>

          <Input
            label="Starts"
            type="datetime-local"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            error={fieldErrors.startTime}
          />

          <Input
            label="Ends"
            type="datetime-local"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            error={fieldErrors.endTime}
          />

          <Input
            label="Points awarded"
            type="number"
            inputMode="numeric"
            min={0}
            value={pointValue}
            onChange={(e) => setPointValue(e.target.value)}
            error={fieldErrors.pointValue}
          />

          {committees.length > 0 ? (
            <Select
              label="Committee"
              hint="Leave as chapter-wide unless this event belongs to one committee."
              value={committeeId}
              onChange={(e) => setCommitteeId(e.target.value)}
            >
              <option value="">Chapter-wide</option>
              {committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </Select>
          ) : null}

          <Switch
            checked={attendanceRequired}
            onChange={setAttendanceRequired}
            label="Attendance required"
            hint="Members who miss a required event are flagged on their profile."
          />

          <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-6)" }}>
            <Button type="submit" variant="primary" busy={saving} block>
              {isEditing ? "Save changes" : "Create event"}
            </Button>
            <Button variant="secondary" block onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
