// src/pages/PointsPage.tsx
//
// Leaderboard, individual and team. The points breakdown (attendance count,
// attendance points, bonus, penalty) is shown alongside the total so it's
// clear where a score came from rather than being an opaque number.
//
// Which view is showing lives in the URL, so a link to the team standings is
// a link to the team standings.

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { getLeaderboard } from "../api/users";
import { createTeam, getTeamLeaderboard } from "../api/teams";
import { listSemesters, type Semester } from "../api/semesters";
import { useAsync } from "../hooks/useAsync";
import { useModulesStore } from "../store/useModulesStore";
import { usePermissions } from "../hooks/usePermissions";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Input, Select, SegmentedControl } from "../components/ui/Form";
import { DataTable, type Column } from "../components/ui/DataTable";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../components/ui/Feedback";
import type { LeaderboardEntry, TeamLeaderboardEntry } from "../types";
import styles from "./PointsPage.module.css";

/** A handful of on-brand-adjacent swatches to pick from — matches the seeded
 * demo teams' palette rather than a raw color picker, which is more choice
 * than "tell Ironclad from Apex on the leaderboard" actually needs. */
const TEAM_COLORS = ["#5B6CC0", "#2F8F6E", "#C8A24A", "#8B5FBF", "#C0525B", "#3E9BB5"];

/** Gold / silver / bronze. Fixed hues — a medal that follows the chapter's
 *  accent color stops reading as a medal. */
const MEDALS = ["#D4AF37", "#B8BCC4", "#B87333"];

function RankBadge({ rank }: { rank: number }) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : null;
  return (
    <span
      className={[styles.rank, medal ? styles.rankTop : ""].filter(Boolean).join(" ")}
      style={medal ? { background: medal } : undefined}
    >
      {rank}
    </span>
  );
}

function IndividualBoard() {
  const [semesterId, setSemesterId] = useState<string | undefined>(undefined);
  const { data: semesters } = useAsync(() => listSemesters(), []);
  const { data, loading, error, reload } = useAsync(() => getLeaderboard({ semesterId }), [semesterId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState title="Couldn't load the leaderboard" body={error} onRetry={() => reload()} />;

  const rows = data?.leaderboard ?? [];

  const columns: Column<LeaderboardEntry>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (entry) => <RankBadge rank={entry.rank} />,
    },
    {
      key: "name",
      header: "Member",
      primary: true,
      render: (entry) => (
        <span className={styles.nameCell}>
          <span className={styles.name}>
            {entry.firstName} {entry.lastName}
          </span>
          {entry.isMe ? <Badge tone="primary">You</Badge> : null}
        </span>
      ),
    },
    {
      key: "breakdown",
      header: "Breakdown",
      render: (entry) => (
        <span className={styles.breakdown}>
          {entry.attendanceCount} event{entry.attendanceCount === 1 ? "" : "s"} ·{" "}
          {entry.attendancePoints} attendance
          {entry.bonusPoints ? ` · +${entry.bonusPoints} bonus` : ""}
          {entry.penaltyPoints ? ` · ${entry.penaltyPoints} penalty` : ""}
        </span>
      ),
    },
    {
      key: "total",
      header: "Points",
      numeric: true,
      render: (entry) => <span className={styles.total}>{entry.total}</span>,
    },
  ];

  return (
    <>
      {semesters && semesters.length > 1 ? (
        <div style={{ marginBottom: "var(--space-4)", maxWidth: 260 }}>
          <Select
            label="Semester"
            value={semesterId ?? ""}
            onChange={(e) => setSemesterId(e.target.value || undefined)}
          >
            {/* This option's own label always names the TRUE current
                semester, not whichever one happens to be selected/viewed —
                data.semesterLabel would follow the selection instead once
                a past semester is picked, which read as if "current" had
                changed to match. */}
            <option value="">
              Current{semesters.find((s) => s.isCurrent) ? ` (${semesters.find((s) => s.isCurrent)!.label})` : ""}
            </option>
            {semesters
              .filter((s) => !s.isCurrent)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </Select>
        </div>
      ) : null}
      <DataTable
        caption={`Individual points leaderboard${data?.semesterLabel ? ` for ${data.semesterLabel}` : ""}`}
        rows={rows}
        columns={columns}
        rowKey={(entry) => entry.userId}
        rowHref={(entry) => `/members/${entry.userId}`}
        empty={
          <Card>
            <EmptyState icon="★" title="No points yet" body="Points appear once members start checking in." />
          </Card>
        }
      />
    </>
  );
}

function CreateTeamDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (teamId: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TEAM_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setColor(TEAM_COLORS[0]);
    setError(null);
  }

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const team = await createTeam({ name: name.trim(), color });
      reset();
      onCreated(team.id);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't create the team — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New team"
      subtitle="A gamification grouping for competitions like Gear Cup — not a committee."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" busy={saving} disabled={!name.trim()} onClick={submit}>
            Create
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Input
        label="Team name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Gear Cup Red"
        autoFocus
      />
      <div style={{ marginTop: "var(--space-2)" }}>
        <p style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginBottom: "var(--space-2)" }}>Color</p>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {TEAM_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Use color ${c}`}
              aria-pressed={color === c}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: c,
                border: color === c ? "3px solid var(--color-text)" : "3px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function TeamBoard() {
  const navigate = useNavigate();
  const { isExecOrAbove } = usePermissions();
  const { data, loading, error, reload } = useAsync(() => getTeamLeaderboard(), []);
  const [createOpen, setCreateOpen] = useState(false);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState title="Couldn't load team standings" body={error} onRetry={() => reload()} />;

  const rows = data?.leaderboard ?? [];

  const columns: Column<TeamLeaderboardEntry>[] = [
    { key: "rank", header: "Rank", render: (team) => <RankBadge rank={team.rank} /> },
    {
      key: "name",
      header: "Team",
      primary: true,
      render: (team) => (
        <span className={styles.nameCell}>
          <span className={styles.swatch} style={{ background: team.color ?? "var(--color-text-muted)" }} />
          <span className={styles.name}>{team.teamName}</span>
          {team.isMyTeam ? <Badge tone="primary">Your team</Badge> : null}
        </span>
      ),
    },
    {
      key: "members",
      header: "Members",
      numeric: true,
      render: (team) => team.memberCount,
    },
    {
      key: "total",
      header: "Points",
      numeric: true,
      render: (team) => <span className={styles.total}>{team.totalPoints}</span>,
    },
  ];

  return (
    <>
      {isExecOrAbove ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            + New team
          </Button>
        </div>
      ) : null}
      <DataTable
        caption="Team points standings"
        rows={rows}
        columns={columns}
        rowKey={(team) => team.teamId}
        rowHref={(team) => `/teams/${team.teamId}`}
        empty={
          <Card>
            <EmptyState
              icon="🏳️"
              title="No teams yet"
              body={
                isExecOrAbove
                  ? "Create one to get started — e.g. for Gear Cup."
                  : "Teams are optional gamification groupings."
              }
              action={
                isExecOrAbove ? (
                  <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                    + New team
                  </Button>
                ) : undefined
              }
            />
          </Card>
        }
      />
      <CreateTeamDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(teamId) => {
          setCreateOpen(false);
          navigate(`/teams/${teamId}`);
        }}
      />
    </>
  );
}

export default function PointsPage() {
  const [params, setParams] = useSearchParams();
  const isTeamsEnabled = useModulesStore((s) => s.isEnabled("teams"));
  const view = params.get("view") === "team" && isTeamsEnabled ? "team" : "individual";

  return (
    <div className="page">
      <PageHeader title="Leaderboard" subtitle="Points earned this semester." />

      {isTeamsEnabled ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <SegmentedControl
            label="Leaderboard view"
            options={[
              { value: "individual", label: "Individual" },
              { value: "team", label: "Teams" },
            ]}
            value={view}
            onChange={(next) => {
              const nextParams = new URLSearchParams(params);
              if (next === "individual") nextParams.delete("view");
              else nextParams.set("view", next);
              setParams(nextParams, { replace: true });
            }}
            block
          />
        </div>
      ) : null}

      {view === "team" ? <TeamBoard /> : <IndividualBoard />}
    </div>
  );
}
