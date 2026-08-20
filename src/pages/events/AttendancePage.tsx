// src/pages/events/AttendancePage.tsx
//
// Manual attendance management for one event. Organizers see the full roster
// with each member's RSVP and attendance state, and can mark someone present
// or remove a mistaken check-in — both requiring a written reason, which the
// backend records in the audit log.
//
// The roster is a DataTable: on a phone each member is a card with their
// status stacked underneath; on a laptop it's a real table, which is the right
// shape for scanning 40 rows and is what an organizer will actually be using.

import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { getEventRoster, manualMarkAttendance } from "../../api/attendance";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Dialog } from "../../components/ui/Dialog";
import { Input, Switch } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { formatTime } from "../../utils/format";
import type { RosterEntry } from "../../types";

type PendingAction = { entry: RosterEntry; action: "mark_present" | "remove" } | null;

export default function AttendancePage() {
  const { eventId = "" } = useParams();
  const { canManageAttendance } = usePermissions();

  const { data, loading, error, reload } = useAsync(() => getEventRoster(eventId), [eventId]);

  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [late, setLate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const roster = data?.roster ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((entry) =>
      `${entry.firstName} ${entry.lastName} ${entry.email}`.toLowerCase().includes(q)
    );
  }, [roster, query]);

  if (!canManageAttendance()) {
    return (
      <div className="page">
        <RequireAccess message="You don't have permission to manage attendance for this event." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load the roster" body={error ?? undefined} onRetry={() => reload()} />
      </div>
    );
  }

  async function submitAction() {
    if (!pending || !reason.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await manualMarkAttendance(eventId, pending.entry.userId, {
        action: pending.action,
        overrideReason: reason.trim(),
        ...(pending.action === "mark_present" ? { late } : {}),
      });
      setPending(null);
      setReason("");
      setLate(false);
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't update attendance.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<RosterEntry>[] = [
    {
      key: "name",
      header: "Member",
      primary: true,
      render: (entry) => `${entry.firstName} ${entry.lastName}`,
    },
    { key: "email", header: "Email", secondary: true, render: (entry) => entry.email },
    {
      key: "rsvp",
      header: "RSVP",
      render: (entry) =>
        entry.rsvpStatus ? (
          <Badge tone="neutral">{entry.rsvpStatus.replace("_", " ")}</Badge>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        ),
    },
    {
      key: "attendance",
      header: "Attendance",
      render: (entry) =>
        entry.attendance ? (
          <Badge tone={entry.attendance.late ? "warning" : "success"}>
            {entry.attendance.late ? "Late" : "Present"} · {formatTime(entry.attendance.checkInTime)}
          </Badge>
        ) : (
          <Badge tone="neutral">Absent</Badge>
        ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Attendance"
        subtitle={data.event.title}
        backTo={`/events/${eventId}`}
        backLabel="Event"
      />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <div style={{ display: "grid", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        <Card>
          <CardLabel>Checked in</CardLabel>
          <p style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>
            {data.checkedInCount}
            <span style={{ fontSize: "var(--text-base)", color: "var(--color-text-muted)", fontWeight: 400 }}>
              {" "}
              / {roster.length}
            </span>
          </p>
        </Card>

        <Input
          label="Search the roster"
          hiddenLabel
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
        />
      </div>

      <DataTable
        caption={`Attendance roster for ${data.event.title}`}
        rows={filtered}
        columns={columns}
        rowKey={(entry) => entry.userId}
        rowActions={(entry) =>
          entry.attendance ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setPending({ entry, action: "remove" });
                setReason("");
              }}
            >
              Remove
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPending({ entry, action: "mark_present" });
                setReason("");
                setLate(false);
              }}
            >
              Mark present
            </Button>
          )
        }
        empty={
          <Card>
            <EmptyState
              icon="👥"
              title={query ? "No matching members" : "No one on the roster"}
              body={query ? "Try a different search." : undefined}
            />
          </Card>
        }
      />

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.action === "remove" ? "Remove check-in" : "Mark present"}
        subtitle={
          pending
            ? `${pending.entry.firstName} ${pending.entry.lastName} — this is recorded in the audit log.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={pending?.action === "remove" ? "dangerSolid" : "primary"}
              onClick={submitAction}
              busy={busy}
              disabled={!reason.trim()}
            >
              {pending?.action === "remove" ? "Remove" : "Mark present"}
            </Button>
          </>
        }
      >
        <Input
          label="Reason"
          required
          hint="Why is this being changed by hand? Recorded against your name."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Arrived without a phone"
          autoFocus
        />
        {pending?.action === "mark_present" ? (
          <Switch
            checked={late}
            onChange={setLate}
            label="Mark as late"
            hint="Late arrivals still earn points but are flagged on their record."
          />
        ) : null}
      </Dialog>
    </div>
  );
}
