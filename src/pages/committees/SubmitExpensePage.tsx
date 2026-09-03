// src/pages/committees/SubmitExpensePage.tsx
//
// Committee chairs submit an expense against their committee's budget, with
// a real receipt photo — lib/uploads.ts on the backend, local disk under a
// Docker volume (self-hosted, single-box, not object storage). The typed
// "Receipt reference" field stays as a fallback note for anyone who'd
// rather point at where the receipt already lives (emailed to treasurer,
// etc.) than attach a photo here.

import { useRef, useState } from "react";
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

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // matches lib/uploads.ts's server-side cap

export default function SubmitExpensePage() {
  const { committeeId = "" } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [receiptPhoto, setReceiptPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handlePhotoPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = ""; // lets picking the same file again re-fire onChange
    if (!picked) return;
    if (picked.size > MAX_UPLOAD_BYTES) {
      setError("That photo is too large — choose one under 15MB.");
      return;
    }
    setError(null);
    setReceiptPhoto(picked);
  }

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
        receiptPhoto: receiptPhoto ?? undefined,
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
          <input
            ref={fileInputRef}
            type="file"
            onChange={handlePhotoPick}
            accept="image/*,.pdf"
            style={{ display: "none" }}
          />
          <div style={{ marginBottom: "var(--space-4)" }}>
            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              {receiptPhoto ? "Change receipt photo" : "Attach receipt photo"}
            </Button>
            {receiptPhoto ? (
              <p style={{ marginTop: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                {receiptPhoto.name}
              </p>
            ) : null}
          </div>
          <Input
            label="Receipt reference"
            value={receiptLabel}
            onChange={(e) => setReceiptLabel(e.target.value)}
            hint={
              receiptPhoto
                ? "Not needed — the attached photo is the receipt."
                : "No photo? Note where the receipt is instead (e.g. 'emailed to treasurer')."
            }
            placeholder="receipt_target_0822.jpg"
            disabled={Boolean(receiptPhoto)}
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
