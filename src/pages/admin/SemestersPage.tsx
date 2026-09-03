// src/pages/admin/SemestersPage.tsx
//
// "Need an easy way to reset all points for everyone. When points reset,
// previous ranking should be saved somewhere for future reference. This
// should NOT alter semester category attendance log for scribe."
//
// Starting a new semester IS the reset: the leaderboard already reads
// per-semester (Points -> Individual/Teams), so a new one shows 0 for
// everyone while every past semester stays queryable exactly as it was —
// see the semester picker on PointsPage.tsx. Nothing here touches
// Attendance at all, which isn't semester-scoped in the first place.

import { useState } from "react";

import { createSemester, listSemesters } from "../../api/semesters";
import { useAsync } from "../../hooks/useAsync";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { formatFullDate } from "../../utils/format";
import profileStyles from "../profile/ProfilePage.module.css";

function defaultDates(): { start: string; end: string } {
  const now = new Date();
  const inFourMonths = new Date(now);
  inFourMonths.setMonth(inFourMonths.getMonth() + 4);
  return { start: now.toISOString().slice(0, 10), end: inFourMonths.toISOString().slice(0, 10) };
}

export default function SemestersPage() {
  const { data, loading, error, reload } = useAsync(() => listSemesters(), []);

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [dates, setDates] = useState(defaultDates);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const semesters = data ?? [];
  const current = semesters.find((s) => s.isCurrent);

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
        subtitle="Starting a new one resets the points leaderboard — past semesters stay exactly as they were."
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
            {" "}Attendance records aren't affected at all — this only changes which semester new points are logged
            against.
          </p>
        </Card>
      </Section>

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
    </div>
  );
}
