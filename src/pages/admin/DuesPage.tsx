// src/pages/admin/DuesPage.tsx
//
// Exec+ dues overview: a summary by status, the searchable per-member list,
// and the two actions an officer needs — record a payment, or waive a balance.

import { useMemo, useState } from "react";

import { getAllDues, recordPayment, waiveDues } from "../../api/dues";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { ChipGroup, Input, Select, Textarea } from "../../components/ui/Form";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { duesStatusTone } from "../../theme/semantic";
import { formatCurrency, type DuesStatus } from "../../types";

/** Methods an officer can record by hand. STRIPE/PYLI are set by their own
 *  payment flows and are never entered manually. */
type ManualMethod = "CASH" | "VENMO" | "CHECK" | "OTHER";

type Row = Awaited<ReturnType<typeof getAllDues>>["records"][number];
type Pending = { row: Row; action: "payment" | "waive" } | null;

const STATUSES: (DuesStatus | "ALL")[] = ["ALL", "UNPAID", "PARTIAL", "PAID", "WAIVED"];
const METHODS: ManualMethod[] = ["CASH", "VENMO", "CHECK", "OTHER"];

export default function DuesPage() {
  const { isExecOrAbove } = usePermissions();

  const { data, loading, error, reload } = useAsync(() => getAllDues(), []);

  const [status, setStatus] = useState<DuesStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ManualMethod>("CASH");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo(() => {
    let list = data?.records ?? [];
    if (status !== "ALL") list = list.filter((row) => row.status === status);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((row) =>
        `${row.user.firstName} ${row.user.lastName} ${row.user.email}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, status, query]);

  if (!isExecOrAbove) {
    return (
      <div className="page">
        <RequireAccess message="Dues management is available to Exec and above." />
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
        <ErrorState title="Couldn't load dues" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  async function submit() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      if (pending.action === "payment") {
        await recordPayment(pending.row.userId, {
          semesterId: pending.row.semesterId,
          amount: Number(amount),
          method,
          note: note.trim() || undefined,
        });
      } else {
        await waiveDues(pending.row.userId, pending.row.semesterId, reason.trim());
      }
      setPending(null);
      setAmount("");
      setNote("");
      setReason("");
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't save — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Member",
      primary: true,
      render: (row) => `${row.user.firstName} ${row.user.lastName}`,
    },
    { key: "email", header: "Email", secondary: true, render: (row) => row.user.email },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={duesStatusTone(row.status)} uppercase>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "paid",
      header: "Paid",
      numeric: true,
      render: (row) => `${formatCurrency(row.amountPaid)} / ${formatCurrency(row.amountOwed)}`,
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Dues" subtitle="Record payments and waive balances." />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Section title="This semester">
        <div
          style={{
            display: "grid",
            gap: "var(--space-3)",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          }}
        >
          {(data?.summary ?? []).map((row) => (
            <Card key={row.status}>
              <CardLabel>{row.status}</CardLabel>
              <p style={{ fontSize: "var(--text-2xl)", fontWeight: 800, color: `var(--color-${duesStatusTone(row.status) === "neutral" ? "text-muted" : duesStatusTone(row.status)})` }}>
                {row._count._all}
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                {formatCurrency(Number(row._sum?.amountPaid ?? 0))} of{" "}
                {formatCurrency(Number(row._sum?.amountOwed ?? 0))}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
        <Input
          label="Search members"
          hiddenLabel
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
        />
        <ChipGroup
          label="Dues status"
          options={STATUSES.map((value) => ({ value, label: value === "ALL" ? "All" : value }))}
          isSelected={(value) => status === value}
          onSelect={(value) => setStatus(value as DuesStatus | "ALL")}
        />
      </div>

      <DataTable
        caption="Member dues records"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        rowActions={(row) => (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPending({ row, action: "payment" });
                setAmount(String(Math.max(row.amountOwed - row.amountPaid, 0)));
                setMethod("CASH");
                setNote("");
              }}
              disabled={row.status === "WAIVED"}
            >
              Record payment
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setPending({ row, action: "waive" });
                setReason("");
              }}
              disabled={row.status === "WAIVED"}
            >
              Waive
            </Button>
          </>
        )}
        empty={
          <Card>
            <EmptyState icon="💰" title="No dues records" body="Nothing matches the current filters." />
          </Card>
        }
      />

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.action === "waive" ? "Waive dues" : "Record payment"}
        subtitle={pending ? `${pending.row.user.firstName} ${pending.row.user.lastName}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={pending?.action === "waive" ? "dangerSolid" : "primary"}
              onClick={submit}
              busy={busy}
              disabled={pending?.action === "waive" ? !reason.trim() : !amount.trim()}
            >
              {pending?.action === "waive" ? "Waive balance" : "Record payment"}
            </Button>
          </>
        }
      >
        {pending?.action === "payment" ? (
          <>
            <Input
              label="Amount"
              required
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as ManualMethod)}>
              {METHODS.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
            <Input
              label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — e.g. cheque #1042"
            />
          </>
        ) : (
          <Textarea
            label="Reason"
            required
            hint="Recorded in the audit log against your name."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Financial hardship, approved by exec board"
            rows={3}
            autoFocus
          />
        )}
      </Dialog>
    </div>
  );
}
