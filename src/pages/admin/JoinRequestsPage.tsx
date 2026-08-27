// src/pages/admin/JoinRequestsPage.tsx
//
// Approve/deny queue for "Request to Join". Approving creates the chapter
// membership server-side.

import { useState } from "react";

import { getJoinRequests, reviewJoinRequest } from "../../api/chapters";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../store/useAuthStore";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChipGroup } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { formatFullDate } from "../../utils/format";

const MEMBER_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", ALUMNI: "Alumni", PNM: "PNM", INACTIVE: "Inactive" };

type Status = "PENDING" | "APPROVED" | "DENIED";
const STATUSES: Status[] = ["PENDING", "APPROVED", "DENIED"];

export default function JoinRequestsPage() {
  const { can } = usePermissions();
  const chapterId = useAuthStore((s) => s.user?.chapterId);
  const [status, setStatus] = useState<Status>("PENDING");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(
    () => (chapterId ? getJoinRequests(chapterId, status) : Promise.resolve([])),
    [chapterId, status]
  );

  if (!can("chapters.manageInvites")) {
    return (
      <div className="page">
        <RequireAccess message="Reviewing join requests requires the chapter membership permission." />
      </div>
    );
  }

  async function review(id: string, approve: boolean) {
    setBusy(id);
    setActionError(null);
    try {
      await reviewJoinRequest(id, approve);
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't update the request.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="Join requests" subtitle="People asking to join the chapter." />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <div style={{ marginBottom: "var(--space-5)" }}>
        <ChipGroup
          label="Request status"
          options={STATUSES.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))}
          isSelected={(value) => status === value}
          onSelect={(value) => setStatus(value as Status)}
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : (data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon="📥"
            title={status === "PENDING" ? "No pending requests" : `No ${status.toLowerCase()} requests`}
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {(data ?? []).map((request) => (
            <Card key={request.id}>
              <p style={{ fontWeight: 700 }}>
                {request.user?.firstName} {request.user?.lastName}
              </p>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                {request.user?.email} · requested {formatFullDate(request.createdAt)}
              </p>
              {request.roleNumber != null && request.memberStatus ? (
                <div style={{ marginTop: "var(--space-2)" }}>
                  <Badge tone="success" uppercase>
                    Verified: {MEMBER_STATUS_LABEL[request.memberStatus] ?? request.memberStatus} · Role #{request.roleNumber}
                  </Badge>
                </div>
              ) : null}
              {request.message ? (
                <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
                  “{request.message}”
                </p>
              ) : null}
              {status === "PENDING" ? (
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
                  <Button
                    variant="primary"
                    onClick={() => review(request.id, true)}
                    busy={busy === request.id}
                    style={{ flex: 1 }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => review(request.id, false)}
                    disabled={busy === request.id}
                    style={{ flex: 1 }}
                  >
                    Deny
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
