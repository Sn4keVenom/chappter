// src/pages/admin/BudgetsPage.tsx
//
// Treasurer overview of every committee's budget: allocated / spent /
// pending / remaining, with inline editing of the allocation.

import { useState } from "react";

import { listCommitteeBudgets, setCommitteeBudget } from "../../api/finance";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Form";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { formatCurrency, type CommitteeBudget } from "../../types";

export default function BudgetsPage() {
  const { isTreasurerOrAdmin } = usePermissions();
  const { data, loading, error, reload } = useAsync(() => listCommitteeBudgets(), []);

  const [editing, setEditing] = useState<CommitteeBudget | null>(null);
  const [allocated, setAllocated] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isTreasurerOrAdmin) {
    return (
      <div className="page">
        <RequireAccess message="Committee budgets are managed by the Treasurer." />
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
        <ErrorState title="Couldn't load budgets" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setActionError(null);
    try {
      await setCommitteeBudget(editing.committeeId, Number(allocated));
      setEditing(null);
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't update the allocation.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<CommitteeBudget>[] = [
    { key: "committee", header: "Committee", primary: true, render: (b) => b.committeeName },
    { key: "allocated", header: "Allocated", numeric: true, render: (b) => formatCurrency(b.allocated) },
    { key: "spent", header: "Spent", numeric: true, render: (b) => formatCurrency(b.spent) },
    { key: "pending", header: "Pending", numeric: true, render: (b) => formatCurrency(b.pending) },
    {
      key: "remaining",
      header: "Remaining",
      numeric: true,
      render: (b) => (
        <strong style={{ color: b.remaining < 0 ? "var(--color-danger)" : "var(--color-success)" }}>
          {formatCurrency(b.remaining)}
        </strong>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Committee budgets" subtitle="Allocations and spending for the current semester." />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <DataTable
        caption="Committee budgets"
        rows={data ?? []}
        columns={columns}
        rowKey={(b) => b.committeeId}
        rowActions={(budget) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(budget);
              setAllocated(String(budget.allocated));
            }}
          >
            Edit allocation
          </Button>
        )}
        empty={
          <Card>
            <EmptyState icon="🏦" title="No committee budgets" body="Allocate a budget to get started." />
          </Card>
        }
      />

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit allocation"
        subtitle={editing?.committeeName}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} busy={busy}>
              Save
            </Button>
          </>
        }
      >
        <Input
          label="Allocated amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={allocated}
          onChange={(e) => setAllocated(e.target.value)}
          autoFocus
        />
      </Dialog>
    </div>
  );
}
