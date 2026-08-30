// src/pages/admin/DuesPage.tsx
//
// dues.manage overview: a summary by status, the searchable per-member list,
// and the actions an officer needs — bill everyone from the chapter
// defaults, manage one member's amount/plan/due date, record a payment, or
// waive a balance. Gated on dues.manage rather than the Exec role tier, so
// the Treasurer office can run dues without also holding Exec (see
// backend/lib/permissionDefaults.ts).

import { useMemo, useState } from "react";

import { getAllDues, initializeSemesterDues, recordPayment, updateMemberDues, waiveDues } from "../../api/dues";
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
import { formatCurrency, type DuesPlan, type DuesStatus } from "../../types";
import { titleCaseEnum } from "../../utils/format";

/** Methods an officer can record by hand. STRIPE/PYLI are set by their own
 *  payment flows and are never entered manually. */
type ManualMethod = "CASH" | "VENMO" | "CHECK" | "OTHER";

type Row = Awaited<ReturnType<typeof getAllDues>>["records"][number];
type Pending = { row: Row; action: "payment" | "waive" } | null;

/** "" stands for "use the chapter default" in both the bill-everyone dialog
 * (no override given) and the per-member one (clear an override, fall back
 * to the default again) — kept as a real Select option rather than an empty
 * value the officer has to know to leave alone. */
type PlanChoice = DuesPlan | "";

const STATUSES: (DuesStatus | "ALL")[] = ["ALL", "UNPAID", "PARTIAL", "PAID", "WAIVED"];
const METHODS: ManualMethod[] = ["CASH", "VENMO", "CHECK", "OTHER"];

/** ISO timestamp → the plain YYYY-MM-DD an <input type="date"> expects. */
function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function DuesPage() {
  const { can } = usePermissions();
  const canManage = can("dues.manage");

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

  const [billOpen, setBillOpen] = useState(false);
  const [billAmount, setBillAmount] = useState("");
  const [billPlan, setBillPlan] = useState<PlanChoice>("");
  const [billDueDate, setBillDueDate] = useState("");
  const [billResult, setBillResult] = useState<string | null>(null);

  const [manageRow, setManageRow] = useState<Row | null>(null);
  const [manageAmount, setManageAmount] = useState("");
  const [managePlan, setManagePlan] = useState<PlanChoice>("");
  const [manageDueDate, setManageDueDate] = useState("");

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

  if (!canManage) {
    return (
      <div className="page">
        <RequireAccess message="Dues management is available to the Treasurer, Exec, and Super Admin." />
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

  async function submitBill() {
    if (!data?.currentSemesterId) return;
    setBusy(true);
    setActionError(null);
    setBillResult(null);
    try {
      const { created, total } = await initializeSemesterDues({
        semesterId: data.currentSemesterId,
        amountOwed: billAmount.trim() ? Number(billAmount) : undefined,
        plan: billPlan || undefined,
        dueDate: billDueDate ? new Date(billDueDate).toISOString() : undefined,
      });
      setBillResult(
        created === total
          ? `Billed all ${total} member${total === 1 ? "" : "s"}.`
          : `Billed ${created} of ${total} — the rest already had a dues record this semester.`
      );
      setBillAmount("");
      setBillPlan("");
      setBillDueDate("");
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't bill members — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function openManage(row: Row) {
    setManageAmount(String(row.amountOwed));
    setManagePlan(row.plan ?? "");
    setManageDueDate(toDateInputValue(row.dueDate));
    setManageRow(row);
  }

  async function submitManage() {
    if (!manageRow || !manageAmount.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await updateMemberDues(manageRow.userId, {
        semesterId: manageRow.semesterId,
        amountOwed: Number(manageAmount),
        plan: managePlan || null,
        dueDate: manageDueDate ? new Date(manageDueDate).toISOString() : null,
      });
      setManageRow(null);
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't update this member's dues.");
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
      key: "plan",
      header: "Plan",
      secondary: true,
      render: (row) => (row.plan ? titleCaseEnum(row.plan) : "—"),
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
      <PageHeader
        title="Dues"
        subtitle="Bill from the chapter defaults, then manage individual members."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setBillResult(null);
              setBillOpen(true);
            }}
            disabled={!data?.currentSemesterId}
          >
            Bill everyone
          </Button>
        }
      />

      {!data?.currentSemesterId ? (
        <ErrorBanner message="No semester spans today — set one in Chapter Settings before billing." />
      ) : null}
      {billResult ? (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-success)", marginBottom: "var(--space-3)" }}>
          {billResult}
        </p>
      ) : null}

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
            <Button size="sm" variant="secondary" onClick={() => openManage(row)}>
              Manage
            </Button>
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

      <Dialog
        open={billOpen}
        onClose={() => setBillOpen(false)}
        title="Bill everyone"
        subtitle="Creates a dues record for every Active/PNM member who doesn't already have one this semester. Leave a field blank to use the chapter's configured default."
        footer={
          <>
            <Button variant="secondary" onClick={() => setBillOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitBill} busy={busy}>
              Bill everyone
            </Button>
          </>
        }
      >
        <Input
          label="Amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={billAmount}
          onChange={(e) => setBillAmount(e.target.value)}
          placeholder="Chapter default"
          hint="Leave blank to bill the amount set in Chapter Settings."
          autoFocus
        />
        <Select
          label="Plan"
          value={billPlan}
          onChange={(e) => setBillPlan(e.target.value as PlanChoice)}
          hint="Individual members can be moved onto a different plan afterward."
        >
          <option value="">Chapter default</option>
          <option value="FULL">Full</option>
          <option value="MONTHLY">Monthly</option>
        </Select>
        <Input
          label="Due date"
          type="date"
          value={billDueDate}
          onChange={(e) => setBillDueDate(e.target.value)}
        />
      </Dialog>

      <Dialog
        open={manageRow !== null}
        onClose={() => setManageRow(null)}
        title="Manage dues"
        subtitle={manageRow ? `${manageRow.user.firstName} ${manageRow.user.lastName} — ${manageRow.semester.label}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setManageRow(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitManage} busy={busy} disabled={!manageAmount.trim()}>
              Save changes
            </Button>
          </>
        }
      >
        <Input
          label="Amount owed"
          required
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={manageAmount}
          onChange={(e) => setManageAmount(e.target.value)}
          autoFocus
        />
        <Select
          label="Plan"
          value={managePlan}
          onChange={(e) => setManagePlan(e.target.value as PlanChoice)}
          hint="Move this one member onto instalments without changing anyone else."
        >
          <option value="">No plan set</option>
          <option value="FULL">Full</option>
          <option value="MONTHLY">Monthly</option>
        </Select>
        <Input
          label="Due date"
          type="date"
          value={manageDueDate}
          onChange={(e) => setManageDueDate(e.target.value)}
        />
      </Dialog>
    </div>
  );
}
