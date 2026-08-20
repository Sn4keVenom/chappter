// src/pages/committees/CommitteeDetailPage.tsx
//
// Committee roster, channel link, and — for the chair or Exec+ — description
// editing, member management, and the budget summary with expense submission.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  addCommitteeMember,
  getCommittee,
  removeCommitteeMember,
  updateCommittee,
} from "../../api/committees";
import { getCommitteeBudget } from "../../api/finance";
import { getRoster } from "../../api/users";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../store/useAuthStore";
import { useModulesStore } from "../../store/useModulesStore";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input, Textarea } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { formatCurrency } from "../../types";
import profileStyles from "../profile/ProfilePage.module.css";

export default function CommitteeDetailPage() {
  const { committeeId = "" } = useParams();
  const { isExecOrAbove } = usePermissions();
  const currentUser = useAuthStore((s) => s.user);
  const isMessagingEnabled = useModulesStore((s) => s.isEnabled("messaging"));

  const { data, loading, error, reload } = useAsync(async () => {
    const committee = await getCommittee(committeeId);
    // The budget is a separate resource and only exists once a treasurer has
    // allocated one — a 404 here is normal, not a failure of the page.
    const budget = await getCommitteeBudget(committeeId).catch(() => null);
    return { committee, budget };
  }, [committeeId]);

  const [editOpen, setEditOpen] = useState(false);
  const [description, setDescription] = useState("");
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

  if (error || !data) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load this committee" body={error ?? undefined} onRetry={() => reload()} />
      </div>
    );
  }

  const { committee, budget } = data;
  const isChair = committee.members.some(
    (member) => member.userId === currentUser?.id && member.role === "CHAIR"
  );
  const canManage = isChair || isExecOrAbove;

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
    <div className="page">
      <PageHeader
        title={committee.name}
        subtitle={committee.description ?? undefined}
        backTo="/committees"
        backLabel="Committees"
        actions={
          <>
            {isMessagingEnabled && committee.channelId ? (
              <ButtonLink to={`/messages/${committee.channelId}`} variant="secondary">
                Open channel
              </ButtonLink>
            ) : null}
            {canManage ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setDescription(committee.description ?? "");
                  setEditOpen(true);
                }}
              >
                Edit
              </Button>
            ) : null}
          </>
        }
      />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      {budget ? (
        <Section title="Budget">
          <Card>
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <CardLabel>Allocated</CardLabel>
                <strong>{formatCurrency(budget.allocated)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <CardLabel>Spent</CardLabel>
                <span>{formatCurrency(budget.spent)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <CardLabel>Pending</CardLabel>
                <span>{formatCurrency(budget.pending)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <CardLabel>Remaining</CardLabel>
                <strong style={{ color: budget.remaining < 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                  {formatCurrency(budget.remaining)}
                </strong>
              </div>
            </div>
            {isChair ? (
              <ButtonLink
                to={`/committees/${committeeId}/expense`}
                variant="primary"
                block
                style={{ marginTop: "var(--space-4)" }}
              >
                Submit an expense
              </ButtonLink>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section
        title={`Members (${committee.members.length})`}
        actions={
          canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
              + Add member
            </Button>
          ) : undefined
        }
      >
        <Card>
          {committee.members.length === 0 ? (
            <EmptyState icon="👥" title="No members yet" />
          ) : (
            committee.members.map((member) => (
              <div key={member.userId} className={profileStyles.row}>
                <Link to={`/members/${member.userId}`} className={profileStyles.rowBody}>
                  <span className={profileStyles.rowTitle}>
                    {member.firstName} {member.lastName}
                  </span>
                </Link>
                <Badge tone={member.role === "CHAIR" ? "accent" : "neutral"} uppercase>
                  {member.role}
                </Badge>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        () => removeCommitteeMember(committeeId, member.userId),
                        "Couldn't remove the member."
                      )
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
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit committee"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              onClick={async () => {
                setEditOpen(false);
                await mutate(
                  () => updateCommittee(committeeId, { description: description.trim() || undefined }),
                  "Couldn't save the committee."
                );
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this committee does, when it meets…"
          rows={4}
        />
      </Dialog>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add committee member"
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
                  await mutate(
                    () => addCommitteeMember(committeeId, { userId: user.id, role: "MEMBER" }),
                    "Couldn't add the member."
                  );
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
