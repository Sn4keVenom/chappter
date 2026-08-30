// src/pages/settings/AchievementsPage.tsx
//
// Editor for the chapter's achievement badges (utils/achievements.ts renders
// them on a member's profile). Gated on `achievements.manage`, granted by
// office to Regent and Vice Regent — deliberately not `settings.manage`,
// which only Super Admin holds by default, so this section has its own
// permission entry in SettingsLayout rather than riding on `adminOnly`.
//
// Definitions live on the server (GET/POST/PATCH/DELETE /achievements); the
// EVALUATION against a member's actual stats still happens client-side in
// utils/achievements.ts. This page only edits what a badge is and what
// earns it.

import { useState } from "react";

import {
  createAchievement,
  deleteAchievement,
  listAchievements,
  resetAchievements,
  updateAchievement,
  type AchievementInputPayload,
} from "../../api/achievements";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import { Input, Select } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import type { AchievementDefinition, AchievementMetric } from "../../types";
import styles from "./AchievementsPage.module.css";

const METRIC_LABELS: Record<AchievementMetric, string> = {
  ATTENDANCE_COUNT: "Events attended",
  TOTAL_POINTS: "Points earned this semester",
  BONUS_COUNT: "Bonus point awards received",
  COMMITTEE_COUNT: "Committees joined",
  RANK_AT_MOST: "Leaderboard rank",
  NEVER_LATE_AFTER: "Check-ins, with zero late arrivals",
  DUES_SETTLED: "Dues paid or waived",
};

const METRICS = Object.keys(METRIC_LABELS) as AchievementMetric[];

/** The one-line "how this is earned" sentence shown on each card — the same
 * comparisons utils/achievements.ts actually evaluates. */
function describeCondition(metric: AchievementMetric, threshold: number): string {
  if (metric === "DUES_SETTLED") return "Earned when dues are paid or waived.";
  if (metric === "RANK_AT_MOST") return `Earned at rank #${threshold} or better.`;
  return `Earned at ${METRIC_LABELS[metric].toLowerCase()} ≥ ${threshold}.`;
}

const emptyDraft: AchievementInputPayload = {
  label: "",
  description: "",
  icon: "⭐",
  metric: "ATTENDANCE_COUNT",
  threshold: 1,
  enabled: true,
};

export default function AchievementsPage() {
  const { can } = usePermissions();
  const canManage = can("achievements.manage");

  const { data, loading, error, reload } = useAsync(() => listAchievements(), []);

  const [editing, setEditing] = useState<AchievementDefinition | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<AchievementInputPayload>(emptyDraft);
  const [removeTarget, setRemoveTarget] = useState<AchievementDefinition | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!canManage) {
    return (
      <div className="page">
        <RequireAccess message="Customizing achievements is available to the Regent, Vice Regent, and Super Admin." />
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

  if (error) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load achievements" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  const achievements = data ?? [];

  async function mutate(action: () => Promise<unknown>, failure: string, onDone?: () => void) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      onDone?.();
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? failure);
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setDraft(emptyDraft);
    setCreating(true);
  }

  function openEdit(a: AchievementDefinition) {
    setDraft({
      label: a.label,
      description: a.description,
      icon: a.icon,
      metric: a.metric,
      threshold: a.threshold,
      enabled: a.enabled,
    });
    setEditing(a);
  }

  function closeDialog() {
    setCreating(false);
    setEditing(null);
  }

  const dialogOpen = creating || editing !== null;
  const thresholdUnused = draft.metric === "DUES_SETTLED";

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Achievements"
        subtitle="Badges members can earn on their profile."
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="secondary" onClick={() => setResetOpen(true)} disabled={busy}>
              Reset to defaults
            </Button>
            <Button variant="primary" onClick={openCreate} disabled={busy}>
              + New achievement
            </Button>
          </div>
        }
      />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Section title={`${achievements.length} achievement${achievements.length === 1 ? "" : "s"}`}>
        {achievements.length === 0 ? (
          <Card>
            <EmptyState icon="🏆" title="No achievements yet" body="Create the first one to get started." />
          </Card>
        ) : (
          <div className={styles.list}>
            {achievements.map((a) => (
              <Card key={a.id} className={a.enabled ? undefined : styles.disabledCard}>
                <div className={styles.row}>
                  <span className={styles.icon} aria-hidden="true">
                    {a.icon}
                  </span>
                  <div className={styles.body}>
                    <div className={styles.titleRow}>
                      <span className={styles.label}>{a.label}</span>
                      {!a.enabled ? (
                        <Badge tone="neutral" uppercase>
                          Disabled
                        </Badge>
                      ) : null}
                    </div>
                    <p className={styles.description}>{a.description}</p>
                    <p className={styles.condition}>{describeCondition(a.metric, a.threshold)}</p>
                  </div>
                  <div className={styles.actions}>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(a)} disabled={busy}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={a.enabled ? "ghost" : "secondary"}
                      onClick={() =>
                        mutate(
                          () => updateAchievement(a.id, { enabled: !a.enabled }),
                          "Couldn't update that achievement."
                        )
                      }
                      disabled={busy}
                    >
                      {a.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRemoveTarget(a)} disabled={busy}>
                      {a.key ? "Disable" : "Delete"}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editing ? "Edit achievement" : "New achievement"}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!draft.label.trim() || !draft.description.trim() || !draft.icon.trim()}
              onClick={() =>
                mutate(
                  () =>
                    editing
                      ? updateAchievement(editing.id, draft)
                      : createAchievement(draft),
                  "Couldn't save that achievement.",
                  closeDialog
                )
              }
            >
              {editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <div className={styles.iconAndLabel}>
          <div className={styles.iconInput}>
            <Input
              label="Icon"
              value={draft.icon}
              onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
              hint="An emoji works best."
            />
          </div>
          <Input
            label="Label"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="Century Club"
          />
        </div>
        <Input
          label="Description"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="Earned 100+ points this semester"
          hint="Shown under the label on a member's profile."
        />
        <Select
          label="Earned by"
          value={draft.metric}
          onChange={(e) => setDraft((d) => ({ ...d, metric: e.target.value as AchievementMetric }))}
        >
          {METRICS.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </Select>
        <Input
          label="Threshold"
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.threshold}
          onChange={(e) => setDraft((d) => ({ ...d, threshold: Number(e.target.value) }))}
          disabled={thresholdUnused}
          hint={
            thresholdUnused
              ? "Not used for this metric — earned as soon as dues are settled."
              : draft.metric === "RANK_AT_MOST"
                ? "Earned at this rank or better (e.g. 3 = top 3)."
                : "Earned once the member reaches at least this number."
          }
        />
        <p className={styles.preview}>{describeCondition(draft.metric, draft.threshold)}</p>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() =>
          removeTarget &&
          mutate(
            () => deleteAchievement(removeTarget.id),
            "Couldn't remove that achievement.",
            () => setRemoveTarget(null)
          )
        }
        title={removeTarget?.key ? "Disable this achievement?" : "Delete this achievement?"}
        body={
          removeTarget?.key
            ? `${removeTarget.label} is one of the built-in defaults, so it's disabled rather than removed — "Reset to defaults" brings it back. Members who already earned it keep it.`
            : `${removeTarget?.label} will be permanently removed.`
        }
        confirmLabel={removeTarget?.key ? "Disable" : "Delete"}
        destructive
        busy={busy}
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() =>
          mutate(() => resetAchievements(), "Couldn't reset achievements.", () => setResetOpen(false))
        }
        title="Reset to defaults?"
        body="Any achievements you've created are removed, and the built-in eight are restored with their original labels, icons, and thresholds. This can't be undone."
        confirmLabel="Reset"
        destructive
        busy={busy}
      />
    </div>
  );
}
