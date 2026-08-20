// src/pages/admin/AuditLogPage.tsx
//
// Read-only view of every privileged mutation: role changes, dues payments,
// point adjustments, permission edits, attendance overrides. Written by the
// backend on each action; this is the only place it's surfaced.

import { getAuditLog } from "../../api/auditlog";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { formatDateTime, titleCaseEnum } from "../../utils/format";
import type { AuditLogEntry } from "../../types";

export default function AuditLogPage() {
  const { isExecOrAbove } = usePermissions();
  const { data, loading, error, reload } = useAsync(() => getAuditLog({ limit: 100 }), []);

  if (!isExecOrAbove) {
    return (
      <div className="page">
        <RequireAccess message="The audit log is available to Exec and above." />
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
        <ErrorState title="Couldn't load the audit log" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "action",
      header: "Action",
      primary: true,
      render: (entry) => <Badge tone="primary">{titleCaseEnum(entry.action)}</Badge>,
    },
    {
      key: "actor",
      header: "By",
      secondary: true,
      render: (entry) => `${entry.actor.firstName} ${entry.actor.lastName}`,
    },
    {
      key: "entity",
      header: "Target",
      render: (entry) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
          {entry.entityType} · {entry.entityId}
        </span>
      ),
    },
    {
      key: "change",
      header: "Change",
      render: (entry) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          {summarize(entry.before)} → {summarize(entry.after)}
        </span>
      ),
    },
    { key: "when", header: "When", render: (entry) => formatDateTime(entry.createdAt) },
  ];

  return (
    <div className="page">
      <PageHeader title="Audit log" subtitle="Every privileged action, with who and when." />

      <DataTable
        caption="Audit log"
        rows={data?.entries ?? []}
        columns={columns}
        rowKey={(entry) => entry.id}
        empty={
          <Card>
            <EmptyState icon="🔒" title="Nothing logged yet" />
          </Card>
        }
      />
    </div>
  );
}

/** Audit payloads are free-form JSON; render a compact one-line summary. */
function summarize(value: unknown): string {
  if (value == null) return "—";
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "—";
  return entries.map(([key, val]) => `${key}: ${val ?? "—"}`).join(", ");
}
