// src/pages/PointsPage.tsx
//
// Leaderboard, individual and team. The points breakdown (attendance count,
// attendance points, bonus, penalty) is shown alongside the total so it's
// clear where a score came from rather than being an opaque number.
//
// Which view is showing lives in the URL, so a link to the team standings is
// a link to the team standings.

import { useSearchParams } from "react-router-dom";

import { getLeaderboard } from "../api/users";
import { getTeamLeaderboard } from "../api/teams";
import { useAsync } from "../hooks/useAsync";
import { useModulesStore } from "../store/useModulesStore";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { SegmentedControl } from "../components/ui/Form";
import { DataTable, type Column } from "../components/ui/DataTable";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/Feedback";
import type { LeaderboardEntry, TeamLeaderboardEntry } from "../types";
import styles from "./PointsPage.module.css";

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
  const { data, loading, error, reload } = useAsync(() => getLeaderboard(), []);

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
  );
}

function TeamBoard() {
  const { data, loading, error, reload } = useAsync(() => getTeamLeaderboard(), []);

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
    <DataTable
      caption="Team points standings"
      rows={rows}
      columns={columns}
      rowKey={(team) => team.teamId}
      rowHref={(team) => `/teams/${team.teamId}`}
      empty={
        <Card>
          <EmptyState icon="🏳️" title="No teams yet" body="Teams are optional gamification groupings." />
        </Card>
      }
    />
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
