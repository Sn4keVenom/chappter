// src/pages/admin/FeedbackListPage.tsx
//
// Review queue for member-submitted feedback and bug reports. Viewing needs
// feedback.view; changing a status needs feedback.manage.

import { useState } from "react";

import { listFeedback, updateFeedbackStatus } from "../../api/feedback";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChipGroup, Select } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { feedbackStatusTone } from "../../theme/semantic";
import { formatFullDate } from "../../utils/format";
import { downloadCsv } from "../../utils/csv";
import type { FeedbackReport, FeedbackStatus } from "../../types";

const TYPE_ICON: Record<string, string> = { BUG: "🐛", FEATURE_REQUEST: "💡", GENERAL: "💬" };
const STATUSES: FeedbackStatus[] = ["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"];

export default function FeedbackListPage() {
  const { can } = usePermissions();
  const [status, setStatus] = useState<FeedbackStatus | "ALL">("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(
    () => listFeedback(status === "ALL" ? {} : { status }),
    [status]
  );

  if (!can("feedback.view")) {
    return (
      <div className="page">
        <RequireAccess message="Viewing submitted feedback requires the feedback permission." />
      </div>
    );
  }

  const canManage = can("feedback.manage");
  const reports = data ?? [];

  function exportCsv() {
    const header = [
      "Type",
      "Status",
      "Message",
      "Submitted by",
      "Platform",
      "App version",
      "Submitted",
      "ID",
    ];
    const rows = reports.map((report: FeedbackReport) => [
      report.type.replace("_", " "),
      report.status.replace("_", " "),
      report.message,
      report.submittedBy
        ? `${report.submittedBy.firstName} ${report.submittedBy.lastName}`
        : "Anonymous",
      report.platform,
      report.appVersion,
      formatFullDate(report.createdAt),
      report.id,
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = status === "ALL" ? "all" : status.toLowerCase();
    downloadCsv(`feedback-${scope}-${stamp}`, [header, ...rows]);
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Feedback"
        subtitle="Bug reports and feature requests from members."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={loading || reports.length === 0}
          >
            Export CSV
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <div style={{ marginBottom: "var(--space-5)" }}>
        <ChipGroup
          label="Status"
          options={[
            { value: "ALL", label: "All" },
            ...STATUSES.map((value) => ({ value, label: value.replace("_", " ") })),
          ]}
          isSelected={(value) => status === value}
          onSelect={(value) => setStatus(value as FeedbackStatus | "ALL")}
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : reports.length === 0 ? (
        <Card>
          <EmptyState icon="💬" title="No feedback" body="Nothing matches the current filter." />
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {reports.map((report) => (
            <Card key={report.id}>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <span aria-hidden="true">{TYPE_ICON[report.type] ?? "💬"}</span>
                <Badge tone="neutral" uppercase>
                  {report.type.replace("_", " ")}
                </Badge>
                <Badge tone={feedbackStatusTone(report.status)} uppercase>
                  {report.status.replace("_", " ")}
                </Badge>
              </div>

              <p style={{ marginTop: "var(--space-3)", lineHeight: 1.55 }}>{report.message}</p>

              <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                {report.submittedBy
                  ? `${report.submittedBy.firstName} ${report.submittedBy.lastName}`
                  : "Anonymous"}{" "}
                · {report.platform} · v{report.appVersion} · {formatFullDate(report.createdAt)}
              </p>

              {canManage ? (
                <div style={{ marginTop: "var(--space-3)" }}>
                  <Select
                    label="Status"
                    value={report.status}
                    disabled={busy === report.id}
                    onChange={async (e) => {
                      setBusy(report.id);
                      setActionError(null);
                      try {
                        await updateFeedbackStatus(report.id, e.target.value as FeedbackStatus);
                        await reload({ silent: true });
                      } catch (err: any) {
                        setActionError(err?.message ?? "Couldn't update the status.");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value.replace("_", " ")}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
