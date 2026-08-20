// src/pages/TeamPage.tsx
//
// Team roster and total points. Teams are gamification-only groupings — not
// committees, no chair. A member belongs to at most one team, so adding
// someone here moves them off any previous team.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { addTeamMember, getTeam, removeTeamMember } from "../api/teams";
import { getRoster } from "../api/users";
import { useAsync } from "../hooks/useAsync";
import { usePermissions } from "../hooks/usePermissions";
import { PageHeader, Section } from "../components/PageHeader";
import { Card, CardLabel } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Input } from "../components/ui/Form";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../components/ui/Feedback";
import profileStyles from "./profile/ProfilePage.module.css";

export default function TeamPage() {
  const { teamId = "" } = useParams();
  const { isExecOrAbove } = usePermissions();
  const { data: team, loading, error, reload } = useAsync(() => getTeam(teamId), [teamId]);

  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: candidates, loading: searching } = useAsync(
    () => (addOpen ? getRoster({ q: query, limit: 15 }).then((r) => r.users) : Promise.resolve([])),
    [query, addOpen]
  );

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load this team" body={error ?? undefined} onRetry={() => reload()} />
      </div>
    );
  }

  async function mutate(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader title={team.name} backTo="/points?view=team" backLabel="Team standings" />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Card accentColor={team.color ?? undefined} style={{ marginBottom: "var(--space-6)" }}>
        <CardLabel>Total points</CardLabel>
        <p style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>{team.totalPoints}</p>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
          {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
        </p>
      </Card>

      <Section
        title={`Roster (${team.members.length})`}
        actions={
          isExecOrAbove ? (
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
              + Add member
            </Button>
          ) : undefined
        }
      >
        <Card>
          {team.members.length === 0 ? (
            <EmptyState icon="👥" title="No members yet" />
          ) : (
            team.members.map((member) => (
              <div key={member.userId} className={profileStyles.row}>
                <Link to={`/members/${member.userId}`} className={profileStyles.rowBody}>
                  <span className={profileStyles.rowTitle}>
                    {member.firstName} {member.lastName}
                  </span>
                  <span className={profileStyles.rowMeta}>{member.points} pts</span>
                </Link>
                {isExecOrAbove ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      mutate(() => removeTeamMember(teamId, member.userId), "Couldn't remove the member.")
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </Card>
      </Section>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add to team"
        subtitle="A member belongs to one team at a time — adding them here moves them off any previous team."
        footer={
          <Button variant="secondary" onClick={() => setAddOpen(false)}>
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
        {searching ? (
          <LoadingState label="Searching…" />
        ) : (
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {(candidates ?? []).map((user) => (
              <button
                key={user.id}
                type="button"
                className={profileStyles.row}
                style={{ width: "100%", textAlign: "left" }}
                disabled={busy}
                onClick={async () => {
                  setAddOpen(false);
                  await mutate(() => addTeamMember(teamId, user.id), "Couldn't add the member.");
                }}
              >
                <span className={profileStyles.rowBody}>
                  <span className={profileStyles.rowTitle}>
                    {user.firstName} {user.lastName}
                  </span>
                  <span className={profileStyles.rowMeta}>{user.email}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
