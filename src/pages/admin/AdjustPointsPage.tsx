// src/pages/admin/AdjustPointsPage.tsx
//
// One-off bonus, penalty, or manual correction against a member's points. The
// reason is mandatory and lands in the audit log — a points change with no
// explanation is exactly the kind of thing a chapter argues about later.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { adjustPoints, getLeaderboard, getMemberProfile } from "../../api/users";
import { getMyDues } from "../../api/dues";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ChoiceList, Input, Textarea } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { fullName } from "../../types";

type AdjustType = "BONUS" | "PENALTY" | "MANUAL_ADJUSTMENT";

export default function AdjustPointsPage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const { isExecOrAbove } = usePermissions();

  const { data, loading } = useAsync(async () => {
    // The leaderboard reports the semester LABEL but not its id, and there is
    // no dedicated "current semester" endpoint. Every DuesRecord carries the
    // id, so the caller's own dues record is the cheapest way to obtain it —
    // the same approach the mobile app used.
    const [member, board, dues] = await Promise.all([
      getMemberProfile(userId),
      getLeaderboard(),
      getMyDues().catch(() => []),
    ]);
    return {
      member,
      semesterId: dues[0]?.semesterId ?? null,
      entry: board.leaderboard.find((e) => e.userId === userId),
    };
  }, [userId]);

  const [type, setType] = useState<AdjustType>("BONUS");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isExecOrAbove) {
    return (
      <div className="page">
        <RequireAccess message="Adjusting points is available to Exec and above." />
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0 || !reason.trim() || !data?.semesterId) return;

    setSaving(true);
    setError(null);
    try {
      await adjustPoints({
        userId,
        semesterId: data.semesterId,
        // A penalty is stored as a negative amount; the form takes a positive
        // number so nobody has to remember to type a minus sign.
        amount: type === "PENALTY" ? -Math.abs(value) : value,
        type,
        reason: reason.trim(),
      });
      navigate(`/members/${userId}`, { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't adjust points — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Adjust points"
        subtitle={data ? fullName(data.member) : undefined}
        backTo={`/members/${userId}`}
        backLabel="Member"
      />

      {error ? <ErrorBanner message={error} /> : null}

      {data?.entry ? (
        <Card style={{ marginBottom: "var(--space-5)" }}>
          <CardLabel>Current total</CardLabel>
          <p style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>{data.entry.total}</p>
        </Card>
      ) : null}

      <Card>
        <form onSubmit={handleSubmit}>
          <fieldset style={{ border: "none", padding: 0, marginBottom: "var(--space-4)" }}>
            <legend
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                marginBottom: "var(--space-2)",
              }}
            >
              Type
            </legend>
            <ChoiceList
              legend="Adjustment type"
              value={type}
              onChange={(next) => setType(next as AdjustType)}
              options={[
                { value: "BONUS", label: "Bonus", hint: "Adds points for extra contribution" },
                { value: "PENALTY", label: "Penalty", hint: "Removes points" },
                { value: "MANUAL_ADJUSTMENT", label: "Correction", hint: "Fixes a recording mistake" },
              ]}
            />
          </fieldset>

          <Input
            label="Points"
            required
            type="number"
            inputMode="numeric"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={type === "PENALTY" ? "Entered as a positive number; recorded as a deduction." : undefined}
            autoFocus
          />

          <Textarea
            label="Reason"
            required
            hint="Recorded in the audit log against your name."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Ran the Food Bank sign-up sheet"
            rows={3}
          />

          <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-6)" }}>
            <Button
              type="submit"
              variant="primary"
              block
              busy={saving}
              disabled={!amount.trim() || !reason.trim() || !data?.semesterId}
            >
              Apply adjustment
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
