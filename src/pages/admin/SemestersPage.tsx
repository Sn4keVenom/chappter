// src/pages/admin/SemestersPage.tsx
//
// Two different "reset the points" actions live on this page, because they
// turned out to be two different asks:
//
//   1. Start a new semester — closes out the CURRENT semester (dates
//      untouched, ledger untouched) and makes a new one current. Since
//      Attendance is scoped by an event's start time falling inside a
//      semester's date range (not a semesterId column), this is also what
//      resets the scribe's per-category attendance tracking — the two are
//      inherently linked here, not a design choice.
//   2. Reset points, same semester — "reset team and personal points...
//      without altering attendance tracking. This is different from the
//      semester reset... specifically for the team and personal point
//      tracking as the fun game." Keeps the current semester exactly as it
//      is; only tags PointsLedger rows (PointsReset model) so the
//      leaderboard reads 0 going forward while every past period — this
//      semester's included — stays queryable via the picker on
//      PointsPage.tsx, same derived-not-stored approach as #1.
//
// Both are non-destructive: nothing is ever deleted, just scoped by a new
// boundary (a new Semester row, or a new PointsReset row).

import { useState } from "react";

import { createSemester, listSemesters } from "../../api/semesters";
import { listPointsResets, resetPoints } from "../../api/users";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { formatFullDate, formatDateTime } from "../../utils/format";
import profileStyles from "../profile/ProfilePage.module.css";

function defaultDates(): { start: string; end: string } {
  const now = new Date();
  const inFourMonths = new Date(now);
  inFourMonths.setMonth(inFourMonths.getMonth() + 4);
  return { start: now.toISOString().slice(0, 10), end: inFourMonths.toISOString().slice(0, 10) };
}

export default function SemestersPage() {
  const { can } = usePermissions();
  const { data, loading, error, reload } = useAsync(() => listSemesters(), []);

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [dates, setDates] = useState(defaultDates);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const semesters = data ?? [];
  const current = semesters.find((s) => s.isCurrent);

  const {
    data: resets,
    reload: reloadResets,
  } = useAsync(() => (current ? listPointsResets(current.id) : Promise.resolve([])), [current?.id]);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  function openDialog() {
    setLabel("");
    setDates(defaultDates());
    setFormError(null);
    setOpen(true);
  }

  async function submit() {
    setSaving(true);
    setFormError(null);
    try {
      await createSemester({
        label: label.trim(),
        startDate: new Date(dates.start).toISOString(),
        endDate: new Date(dates.end).toISOString(),
      });
      setOpen(false);
      await reload({ silent: true });
    } catch (e: any) {
      setFormError(e?.message ?? "Couldn't create that semester.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmResetPoints() {
    setResetting(true);
    setResetError(null);
    try {
      await resetPoints();
      setResetConfirmOpen(false);
      await reloadResets({ silent: true });
    } catch (e: any) {
      setResetError(e?.message ?? "Couldn't reset points.");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load semesters" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Semesters"
        subtitle="Two different resets live here — starting a new semester, and resetting points within the current one."
      />

      <Section
        title="Start a new semester"
        actions={
          <Button size="sm" variant="primary" onClick={openDialog}>
            + New semester
          </Button>
        }
      >
        <Card>
          <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.55, color: "var(--color-text-muted)" }}>
            Everyone's point total goes back to 0 on the new semester — nobody's history is deleted.{" "}
            {current ? (
              <>
                <strong>{current.label}</strong> is currently active and will close automatically the moment the
                new one starts.
              </>
            ) : null}
            {" "}This also resets the scribe's category attendance tracking, since it's scoped to the semester's
            dates — use this for an actual new academic semester, not just to refresh the scoreboard.
          </p>
        </Card>
      </Section>

      {can("points.reset") ? (
        <Section
          title="Reset points"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setResetConfirmOpen(true)} disabled={!current}>
              Reset points
            </Button>
          }
        >
          <Card>
            {resetError ? <ErrorBanner message={resetError} /> : null}
            <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.55, color: "var(--color-text-muted)" }}>
              Zeros the team and individual leaderboards for the fun-game score —{" "}
              {current ? <strong>{current.label}</strong> : "the current semester"} itself, and the scribe's
              attendance tracking, stay exactly as they are. Nobody's history is deleted; past standings stay
              viewable from the leaderboard's own picker.
            </p>
            {resets && resets.length > 0 ? (
              <div style={{ marginTop: "var(--space-3)" }}>
                {resets.map((r) => (
                  <div key={r.id} className={profileStyles.row}>
                    <span className={profileStyles.rowBody}>
                      <span className={profileStyles.rowTitle}>Reset on {formatDateTime(r.resetAt)}</span>
                      {r.resetByName ? <span className={profileStyles.rowMeta}>by {r.resetByName}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title="All semesters">
        <Card>
          {semesters.length === 0 ? (
            <EmptyState icon="🗓" title="No semesters yet" />
          ) : (
            semesters.map((s) => (
              <div key={s.id} className={profileStyles.row}>
                <span className={profileStyles.rowBody}>
                  <span className={profileStyles.rowTitle}>{s.label}</span>
                  <span className={profileStyles.rowMeta}>
                    {formatFullDate(s.startDate)} – {formatFullDate(s.endDate)}
                  </span>
                </span>
                {s.isCurrent ? (
                  <Badge tone="primary" uppercase>
                    Current
                  </Badge>
                ) : null}
              </div>
            ))
          )}
        </Card>
      </Section>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Start a new semester"
        subtitle="This resets the leaderboard for everyone. Past semesters are unaffected."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" busy={saving} disabled={!label.trim()} onClick={submit}>
              Start semester
            </Button>
          </>
        }
      >
        {formError ? <ErrorBanner message={formError} /> : null}
        <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Spring 2027" autoFocus />
        <Input
          label="Start date"
          type="date"
          value={dates.start}
          onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))}
        />
        <Input
          label="End date"
          type="date"
          value={dates.end}
          onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))}
        />
      </Dialog>

      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={confirmResetPoints}
        title="Reset points?"
        body={
          current
            ? `Everyone's team and individual points go back to 0 for ${current.label}. This does NOT start a new semester and does NOT touch attendance tracking — only the fun-game score. Past standings stay viewable from the leaderboard's picker.`
            : "Everyone's team and individual points go back to 0. This does NOT start a new semester and does NOT touch attendance tracking."
        }
        confirmLabel="Reset points"
        destructive
        busy={resetting}
      />
    </div>
  );
}
