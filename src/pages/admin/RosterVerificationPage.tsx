// src/pages/admin/RosterVerificationPage.tsx
//
// Exec-maintained verification roster (real member/alumni names + role
// numbers) that a new signup's claim gets checked against — see
// SignUpPage.tsx/VerifyEmailPage.tsx for the signup side, and
// ChapterRosterEntry's doc comment in schema.prisma for why this is a
// separate list from the member roster at admin/RosterPage.tsx (that one is
// live membership; this one is pre-loaded verification data, independent of
// who has actually signed up yet).

import { useState } from "react";

import {
  bulkCreateRosterEntries,
  createRosterEntry,
  deleteRosterEntry,
  listRosterEntries,
  type RosterEntryInput,
} from "../../api/roster";
import type { ChapterRosterEntry } from "../../types";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../store/useAuthStore";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import { ChoiceList, Input, Textarea, type Choice } from "../../components/ui/Form";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";

const STATUS_OPTIONS: Choice<"ACTIVE" | "INACTIVE" | "ALUMNI">[] = [
  { value: "ACTIVE", label: "Active" },
  // Signup only offers Active/Alumni (see SignUpPage.tsx), so an Inactive
  // row won't be matched by that self-service claim — it's exec-managed
  // record-keeping, or gets claimed some other way (invite code, join
  // request) that doesn't check status at all.
  { value: "INACTIVE", label: "Inactive", hint: "Not selectable at signup — record-keeping only" },
  { value: "ALUMNI", label: "Alumni" },
];

const EMPTY_DRAFT: RosterEntryInput = { firstName: "", lastName: "", roleNumber: 0, status: "ACTIVE" };

function AddEntryDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (entry: RosterEntryInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RosterEntryInput>(EMPTY_DRAFT);
  const [roleNumberText, setRoleNumberText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDraft(EMPTY_DRAFT);
    setRoleNumberText("");
    setError(null);
  }

  async function submit() {
    const n = Number(roleNumberText);
    if (!draft.firstName.trim() || !draft.lastName.trim() || !roleNumberText.trim() || !Number.isInteger(n) || n <= 0) {
      setError("Fill in a first name, last name, and a valid role number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...draft, firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), roleNumber: n });
      reset();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't add this entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add roster entry"
      subtitle="A signup can claim this row by matching the first name, role number, and status exactly."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} busy={saving}>
            Add
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Input
        label="First name"
        value={draft.firstName}
        onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
      />
      <Input
        label="Last name"
        hint="For your reference in this list only — matching is first-name-only."
        value={draft.lastName}
        onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
      />
      <Input
        label="Role number"
        type="number"
        inputMode="numeric"
        value={roleNumberText}
        onChange={(e) => setRoleNumberText(e.target.value)}
      />
      <div style={{ marginBottom: "var(--space-2)" }}>
        <ChoiceList
          legend="Status"
          options={STATUS_OPTIONS}
          value={draft.status}
          onChange={(status) => setDraft((d) => ({ ...d, status }))}
        />
      </div>
    </Dialog>
  );
}

/** Splits a pasted line on the first comma or tab — accepts either format
 * without asking the exec board to pick one. */
function parseBulkRows(text: string): { rows: RosterEntryInput[]; malformed: number[] } {
  const rows: RosterEntryInput[] = [];
  const malformed: number[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  lines.forEach((line, index) => {
    const parts = line.split(/\t|,/).map((p) => p.trim());
    const [firstName, lastName, roleNumberRaw, statusRaw] = parts;
    const roleNumber = Number(roleNumberRaw);
    const status = statusRaw?.toUpperCase();
    if (
      !firstName ||
      !lastName ||
      !Number.isInteger(roleNumber) ||
      roleNumber <= 0 ||
      (status !== "ACTIVE" && status !== "INACTIVE" && status !== "ALUMNI")
    ) {
      malformed.push(index);
      return;
    }
    rows.push({ firstName, lastName, roleNumber, status });
  });

  return { rows, malformed };
}

function BulkImportDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (rows: RosterEntryInput[]) => Promise<{ created: number; errors: { index: number; error: string }[] }>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { index: number; error: string }[]; malformed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { rows, malformed } = parseBulkRows(text);

  function reset() {
    setText("");
    setResult(null);
    setError(null);
  }

  async function submit() {
    if (rows.length === 0) {
      setError("Paste at least one valid row first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const outcome = await onSubmit(rows);
      setResult({ ...outcome, malformed: malformed.length });
      setText("");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't import these rows.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Bulk import"
      subtitle="One row per line: first name, last name, role number, status (Active, Inactive, or Alumni) — separated by a comma or tab."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button variant="primary" onClick={submit} busy={saving} disabled={rows.length === 0}>
            Import {rows.length > 0 ? `${rows.length} row${rows.length === 1 ? "" : "s"}` : ""}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      {result ? (
        <p style={{ marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}>
          Added {result.created} row{result.created === 1 ? "" : "s"}.
          {result.errors.length > 0 ? ` ${result.errors.length} skipped (duplicate role number).` : ""}
          {result.malformed > 0 ? ` ${result.malformed} line(s) couldn't be parsed and were ignored.` : ""}
        </p>
      ) : null}

      <Textarea
        label="Rows to import"
        hiddenLabel
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Jordan, Smith, 214, Active\nRiley, Chen, 201, Inactive\nCasey, Lee, 88, Alumni"}
        style={{ fontFamily: "var(--font-mono)" }}
      />
      <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
        {rows.length} valid row{rows.length === 1 ? "" : "s"} detected
        {malformed.length > 0 ? `, ${malformed.length} line(s) not recognized` : ""}.
      </p>
    </Dialog>
  );
}

export default function RosterVerificationPage() {
  const { can } = usePermissions();
  const chapterId = useAuthStore((s) => s.user?.chapterId);

  const { data, loading, error, reload } = useAsync(
    () => (chapterId ? listRosterEntries(chapterId) : Promise.resolve([])),
    [chapterId]
  );

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChapterRosterEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!can("chapters.manageInvites")) {
    return (
      <div className="page">
        <RequireAccess message="Managing the verification roster requires the chapter membership permission." />
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

  const entries = data ?? [];

  async function handleDelete() {
    if (!chapterId || !deleteTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteRosterEntry(chapterId, deleteTarget.id);
      setDeleteTarget(null);
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't delete this entry.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<ChapterRosterEntry>[] = [
    { key: "name", header: "Name", primary: true, render: (r) => `${r.firstName} ${r.lastName}` },
    { key: "roleNumber", header: "Role #", numeric: true, render: (r) => r.roleNumber },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge tone="neutral" uppercase>
          {r.status}
        </Badge>
      ),
    },
    {
      key: "claimed",
      header: "Claimed",
      render: (r) => (
        <Badge tone={r.claimedByUserId ? "success" : "neutral"} uppercase>
          {r.claimedByUserId ? "Claimed" : "Unclaimed"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Roster Verification"
        subtitle="Real members and alumni, pre-loaded so a new signup's claimed name and role number can be checked before their join request reaches you."
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              Bulk import
            </Button>
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              + Add entry
            </Button>
          </div>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <DataTable
        caption="Roster verification entries"
        rows={entries}
        columns={columns}
        rowKey={(r) => r.id}
        rowActions={(r) => (
          <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)} disabled={busy}>
            Delete
          </Button>
        )}
        empty={
          <Card>
            <EmptyState
              icon="🧾"
              title="No roster entries yet"
              body="Add members one at a time, or paste a batch with Bulk import."
            />
          </Card>
        }
      />

      <AddEntryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (entry) => {
          if (!chapterId) throw new Error("Your account isn't attached to a chapter yet.");
          await createRosterEntry(chapterId, entry);
          await reload({ silent: true });
        }}
      />

      <BulkImportDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSubmit={async (rows) => {
          if (!chapterId) throw new Error("Your account isn't attached to a chapter yet.");
          const outcome = await bulkCreateRosterEntries(chapterId, rows);
          await reload({ silent: true });
          return { created: outcome.created.length, errors: outcome.errors };
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete this roster entry?"
        body={
          deleteTarget
            ? `${deleteTarget.firstName} ${deleteTarget.lastName} (role #${deleteTarget.roleNumber}) will no longer be able to be matched by a signup.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={busy}
      />
    </div>
  );
}
