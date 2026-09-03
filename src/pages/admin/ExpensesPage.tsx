// src/pages/admin/ExpensesPage.tsx
//
// Reimbursement queue. A Treasurer sees every committee's expenses and can
// approve, reject, or settle them; a committee chair reaching this page sees
// only their own committee's, read-only — the API enforces that scope, this
// just doesn't render controls the server would reject.

import { useState } from "react";

import { listExpenses, openExpenseReceipt, updateExpenseStatus } from "../../api/finance";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChipGroup } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { reimbursementStatusTone } from "../../theme/semantic";
import { formatCurrency, type ReimbursementStatus } from "../../types";
import { formatFullDate } from "../../utils/format";

const STATUSES: ReimbursementStatus[] = ["SUBMITTED", "APPROVED", "REIMBURSED", "REJECTED"];

export default function ExpensesPage() {
  const { isTreasurerOrAdmin } = usePermissions();
  const [status, setStatus] = useState<ReimbursementStatus | "ALL">("SUBMITTED");
  const [busy, setBusy] = useState<string | null>(null);
  const [openingReceipt, setOpeningReceipt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(
    () => listExpenses(status === "ALL" ? {} : { status }),
    [status]
  );

  async function viewReceipt(id: string) {
    setOpeningReceipt(id);
    setActionError(null);
    try {
      await openExpenseReceipt(id);
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't open that receipt.");
    } finally {
      setOpeningReceipt(null);
    }
  }

  async function update(id: string, next: ReimbursementStatus) {
    setBusy(id);
    setActionError(null);
    try {
      await updateExpenseStatus(id, { status: next });
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't update the expense.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="Reimbursements" subtitle="Expenses submitted against committee budgets." />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <div style={{ marginBottom: "var(--space-5)" }}>
        <ChipGroup
          label="Status"
          options={[
            { value: "ALL", label: "All" },
            ...STATUSES.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() })),
          ]}
          isSelected={(value) => status === value}
          onSelect={(value) => setStatus(value as ReimbursementStatus | "ALL")}
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : (data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon="🧾" title="No expenses" body="Nothing matches the current filter." />
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {(data ?? []).map((expense) => (
            <Card key={expense.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "var(--text-lg)" }}>{formatCurrency(expense.amount)}</strong>
                <Badge tone={reimbursementStatusTone(expense.status)} uppercase>
                  {expense.status}
                </Badge>
              </div>

              <p style={{ marginTop: "var(--space-2)", lineHeight: 1.55 }}>{expense.description}</p>

              <p style={{ marginTop: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                {expense.committeeName} · {expense.submittedBy.firstName} {expense.submittedBy.lastName} ·{" "}
                {formatFullDate(expense.date)}
                {expense.receiptLabel && !expense.receiptStoredFileName ? ` · receipt: ${expense.receiptLabel}` : ""}
              </p>

              {expense.receiptStoredFileName ? (
                <div style={{ marginTop: "var(--space-3)" }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    busy={openingReceipt === expense.id}
                    onClick={() => viewReceipt(expense.id)}
                  >
                    🧾 View receipt
                  </Button>
                </div>
              ) : null}

              {isTreasurerOrAdmin && expense.status !== "REIMBURSED" && expense.status !== "REJECTED" ? (
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
                  {expense.status === "SUBMITTED" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => update(expense.id, "APPROVED")}
                      busy={busy === expense.id}
                      style={{ flex: 1 }}
                    >
                      Approve
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => update(expense.id, "REIMBURSED")}
                    disabled={busy === expense.id}
                    style={{ flex: 1 }}
                  >
                    Mark reimbursed
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => update(expense.id, "REJECTED")}
                    disabled={busy === expense.id}
                    style={{ flex: 1 }}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
