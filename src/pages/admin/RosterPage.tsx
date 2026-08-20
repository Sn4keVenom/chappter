// src/pages/admin/RosterPage.tsx
//
// Full searchable chapter roster. The classic case for the responsive table:
// on a laptop an officer scans 40 rows of name/role/status/class at once; on a
// phone the same records become cards, because five columns at 360px is
// unreadable and a sideways-scrolling table hides half the data.

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getRoster } from "../../api/users";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { ChipGroup, Input } from "../../components/ui/Form";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { userRoleTone } from "../../theme/semantic";
import type { MemberStatus, RosterEntry, UserRole } from "../../types";

const ROLES: (UserRole | "ALL")[] = ["ALL", "MEMBER", "EXEC", "SUPER_ADMIN", "PNM", "ALUMNI"];
const STATUSES: (MemberStatus | "ALL")[] = ["ALL", "ACTIVE", "PNM", "ALUMNI", "INACTIVE"];

/** The roster endpoint returns UserSummary-shaped rows. */
type Row = Awaited<ReturnType<typeof getRoster>>["users"][number];

export default function RosterPage() {
  const { canViewAdminPanel } = usePermissions();
  const [params, setParams] = useSearchParams();

  const role = (params.get("role") ?? "ALL") as UserRole | "ALL";
  const status = (params.get("status") ?? "ALL") as MemberStatus | "ALL";
  const [query, setQuery] = useState(params.get("q") ?? "");

  const { data, loading, error, reload } = useAsync(
    () =>
      getRoster({
        limit: 200,
        ...(role !== "ALL" ? { role } : {}),
        ...(status !== "ALL" ? { status } : {}),
      }),
    [role, status]
  );

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const rows = useMemo(() => {
    const all = data?.users ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((user) =>
      `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(q)
    );
  }, [data, query]);

  if (!canViewAdminPanel) {
    return (
      <div className="page">
        <RequireAccess message="The roster is available to officers and above." />
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
        <ErrorState title="Couldn't load the roster" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Member",
      primary: true,
      render: (user) => `${user.firstName} ${user.lastName}`,
    },
    { key: "email", header: "Email", secondary: true, render: (user) => user.email },
    {
      key: "role",
      header: "Role",
      render: (user) => (
        <Badge tone={userRoleTone(user.role ?? "MEMBER")} uppercase>
          {user.role ?? "—"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (user) => <Badge tone="neutral" uppercase>{user.status ?? "—"}</Badge>,
    },
    {
      key: "roleNumber",
      header: "#",
      numeric: true,
      render: (user) => (user.roleNumber != null ? user.roleNumber : "—"),
    },
    {
      key: "pledgeClass",
      header: "Pledge class",
      render: (user) => user.pledgeClassLabel ?? "—",
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Roster"
        subtitle={`${rows.length} of ${data?.total ?? rows.length} members`}
      />

      <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
        <Input
          label="Search the roster"
          hiddenLabel
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
        />
        <ChipGroup
          label="Role"
          options={ROLES.map((value) => ({ value, label: value === "ALL" ? "All roles" : value }))}
          isSelected={(value) => role === value}
          onSelect={(value) => setParam("role", value === "ALL" ? null : value)}
        />
        <ChipGroup
          label="Status"
          options={STATUSES.map((value) => ({ value, label: value === "ALL" ? "All statuses" : value }))}
          isSelected={(value) => status === value}
          onSelect={(value) => setParam("status", value === "ALL" ? null : value)}
        />
      </div>

      <DataTable
        caption="Chapter roster"
        rows={rows}
        columns={columns}
        rowKey={(user) => user.id}
        rowHref={(user) => `/members/${user.id}`}
        empty={
          <Card>
            <EmptyState
              icon="👥"
              title="No matching members"
              body="Try a different search or clear the filters."
            />
          </Card>
        }
      />
    </div>
  );
}
