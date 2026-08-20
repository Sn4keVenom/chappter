// src/pages/committees/SubmitExpensePage.tsx
//
// Committee chairs submit an expense against their committee's budget. The
// receipt is a label rather than a file: there is no object storage behind
// this yet, and pretending otherwise would lose people's receipts.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getCommittee } from "../../api/committees";
import { getCommitteeBudget, submitExpense } from "../../api/finance";
import { useAsync } from "../../hooks/useAsync";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Textarea } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { formatCurrency } from "../../types";

export default function SubmitExpensePage() {
  const { committeeId = "" } = useParams();
  const navigate = useNavigate();

  const { data, loading } = useAsync(async () => {
    const [committee, budget] = await Promise.all([
      getCommittee(committeeId),
      getCommitteeBudget(committeeId).catch(() => null),
    ]);
    return { committee, budget };
  }, [committeeId]);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptLabel, setReceiptLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const errors: Record<string, string> = {};
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) errors.amount = "Enter an amount greater than zero.";
    if (!description.trim()) errors.description = "Describe what this was for.";
    if (!date) errors.date = "Choose the date of the expense.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      await submitExpense({
        committeeId,
        amount: value,
        description: description.trim(),
        date: new Date(date).toISOString(),
        receiptLabel: receiptLabel.trim() || undefined,
      });
      navigate(`/committees/${committeeId}`, { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't submit the expense — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Submit an expense"
        subtitle={data?.committee.name}
        backTo={`/committees/${committeeId}`}
        backLabel="Committee"
      />

      {error ? <ErrorBanner message={error} /> : null}

      {data?.budget ? (
        <Card style={{ marginBottom: "var(--space-5)" }}>
          <CardLabel>Budget remaining</CardLabel>
          <p style={{ fontSize: "var(--text-xl)", fontWeight: 800 }}>
            {formatCurrency(data.budget.remaining)}
          </p>
        </Card>
      ) : null}

      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="Amount"
            required
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={fieldErrors.amount}
            placeholder="42.50"
            autoFocus
          />
          <Textarea
            label="What was this for?"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={fieldErrors.description}
            placeholder="Supplies for the Food Bank volunteer day"
            rows={3}
          />
          <Input
            label="Date of expense"
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={fieldErrors.date}
          />
          <Input
            label="Receipt reference"
            value={receiptLabel}
            onChange={(e) => setReceiptLabel(e.target.value)}
            hint="Uploading a file isn't supported yet — note where the receipt is (e.g. 'emailed to treasurer')."
            placeholder="receipt_target_0822.jpg"
          />

          <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-6)" }}>
            <Button type="submit" variant="primary" block busy={saving}>
              Submit for reimbursement
            </Button>
            <Button variant="secondary" block onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
