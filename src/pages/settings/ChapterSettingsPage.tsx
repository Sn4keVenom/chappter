// src/pages/settings/ChapterSettingsPage.tsx
//
// Operational chapter configuration — semester dates, dues and attendance
// defaults. Distinct from Chapter Branding, which covers the chapter's visual
// identity; these are the numbers the rest of the app calculates against.

import { useEffect, useState } from "react";

import { getChapterSettings, updateChapterSettings } from "../../api/settings";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import type { ChapterSettings, DuesPlan } from "../../types";

function toDateInput(iso: string): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

export default function ChapterSettingsPage() {
  const { isSuperAdmin } = usePermissions();
  const { data, loading, error, reload } = useAsync(() => getChapterSettings(), []);

  const [draft, setDraft] = useState<ChapterSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (!isSuperAdmin) {
    return <RequireAccess message="Chapter settings are managed by a Super Admin." />;
  }

  if (loading || !draft) return <LoadingState />;

  function set<K extends keyof ChapterSettings>(key: K, value: ChapterSettings[K]) {
    setSaved(false);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateChapterSettings(draft);
      await reload({ silent: true });
      setSaved(true);
    } catch (e: any) {
      setSaveError(e?.message ?? "Couldn't save chapter settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Chapter settings"
        subtitle="Semester dates and the defaults the rest of the app calculates against."
        backTo="/settings"
        backLabel="Settings"
      />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {saveError ? <ErrorBanner message={saveError} /> : null}
      {saved ? (
        <div role="status" style={{ marginBottom: "var(--space-4)" }}>
          <Card>Chapter settings saved.</Card>
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Section title="Identity">
          <Card>
            <Input
              label="Chapter name"
              value={draft.chapterName}
              onChange={(e) => set("chapterName", e.target.value)}
            />
            <Input
              label="Letters"
              value={draft.chapterLetters}
              onChange={(e) => set("chapterLetters", e.target.value)}
            />
            <Input
              label="University"
              value={draft.university}
              onChange={(e) => set("university", e.target.value)}
            />
          </Card>
        </Section>

        <Section title="Semester">
          <Card>
            <Input
              label="Current semester label"
              value={draft.currentSemesterLabel}
              onChange={(e) => set("currentSemesterLabel", e.target.value)}
              placeholder="Fall 2026"
            />
            <Input
              label="Semester starts"
              type="date"
              value={toDateInput(draft.semesterStartDate)}
              onChange={(e) => set("semesterStartDate", new Date(e.target.value).toISOString())}
            />
            <Input
              label="Semester ends"
              type="date"
              value={toDateInput(draft.semesterEndDate)}
              onChange={(e) => set("semesterEndDate", new Date(e.target.value).toISOString())}
            />
          </Card>
        </Section>

        <Section title="Defaults">
          <Card>
            <Input
              label="Default dues amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={String(draft.defaultDuesAmount)}
              onChange={(e) => set("defaultDuesAmount", Number(e.target.value))}
            />
            <Select
              label="Default dues plan"
              value={draft.defaultDuesPlan}
              onChange={(e) => set("defaultDuesPlan", e.target.value as DuesPlan)}
            >
              <option value="FULL">Pay in full</option>
              <option value="MONTHLY">Monthly</option>
            </Select>
            <Input
              label="Late threshold (minutes)"
              hint="Check-ins after this many minutes past the start are flagged late."
              type="number"
              inputMode="numeric"
              min="0"
              value={String(draft.attendanceLateThresholdMinutes)}
              onChange={(e) => set("attendanceLateThresholdMinutes", Number(e.target.value))}
            />
            <Input
              label="Default event points"
              type="number"
              inputMode="numeric"
              min="0"
              value={String(draft.defaultEventPointValue)}
              onChange={(e) => set("defaultEventPointValue", Number(e.target.value))}
            />
          </Card>
        </Section>

        <Button type="submit" variant="primary" block busy={saving}>
          Save chapter settings
        </Button>
      </form>
    </div>
  );
}
