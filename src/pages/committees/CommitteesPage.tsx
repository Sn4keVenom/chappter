// src/pages/committees/CommitteesPage.tsx
//
// Committee index. New in the web app: the mobile build had no committee
// list — committees were only reachable from the admin panel or a member's
// profile. On the web a top-level navigation item needs a destination, and a
// browsable list is what people expect at /committees.
//
// Exec+ (committees.manage) can also create and dissolve committees from
// here. Dissolving archives the committee's channel rather than deleting it,
// so the discussion history survives — see DELETE /committees/:id.

import { useState } from "react";

import { createCommittee, deleteCommittee, listCommittees } from "../../api/committees";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardLink } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import type { Committee } from "../../types";

export default function CommitteesPage() {
  const { can } = usePermissions();
  const canManage = can("committees.manage");

  const { data, loading, error, reload } = useAsync(() => listCommittees(), []);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Committee | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
        <ErrorState title="Couldn't load committees" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  const committees = data ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Committees"
        subtitle="Every committee in the chapter."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              + New committee
            </Button>
          ) : undefined
        }
      />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      {committees.length === 0 ? (
        <Card>
          <EmptyState
            icon="⬡"
            title="No committees yet"
            body={canManage ? "Create one to get started." : undefined}
          />
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "var(--space-3)",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {committees.map((committee) => (
            <div key={committee.id} style={{ display: "grid", gap: "var(--space-2)" }}>
              <CardLink to={`/committees/${committee.id}`}>
                <p style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{committee.name}</p>
                {committee.description ? (
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginTop: "var(--space-1)" }}>
                    {committee.description}
                  </p>
                ) : null}
                <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-3)" }}>
                  {committee.memberCount} member{committee.memberCount === 1 ? "" : "s"}
                </p>
              </CardLink>
              {canManage ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => setDeleteTarget(committee)}
                >
                  Dissolve
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setName("");
          setDescription("");
        }}
        title="New committee"
        subtitle="Its discussion channel is created automatically."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!name.trim()}
              onClick={() =>
                mutate(
                  () => createCommittee({ name: name.trim(), description: description.trim() || undefined }),
                  "Couldn't create the committee.",
                  () => {
                    setAddOpen(false);
                    setName("");
                    setDescription("");
                  }
                )
              }
            >
              Create
            </Button>
          </>
        }
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Community Service"
          autoComplete="off"
        />
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
          autoComplete="off"
        />
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget &&
          mutate(() => deleteCommittee(deleteTarget.id), "Couldn't dissolve the committee.", () =>
            setDeleteTarget(null)
          )
        }
        title="Dissolve this committee?"
        body={
          deleteTarget
            ? `${deleteTarget.name} and its ${deleteTarget.memberCount} member${deleteTarget.memberCount === 1 ? "" : "s"} will be removed. Its channel is archived rather than deleted, so past discussion is kept, and its events become ordinary chapter events.`
            : undefined
        }
        confirmLabel="Dissolve"
        destructive
        busy={busy}
      />
    </div>
  );
}
