// src/pages/admin/AttendanceReportPage.tsx
//
// "A way for scribe to view the committee based attendance of each person.
// For example, we have to attend one community service, one brotherhood,
// on PD, etc, so there should be a way to track how many of each category
// has been attended by each user."
//
// Counts only, per member per event category, for the selected semester
// (defaults to current) — no pass/fail threshold, since none was specified.
// A 0 is highlighted so it's easy to spot at a glance who hasn't covered a
// category yet.

import { useState } from "react";

import { getAttendanceCategoryReport } from "../../api/attendance";
import { listSemesters } from "../../api/semesters";
import { useAsync } from "../../hooks/useAsync";
import { PageHeader } from "../../components/PageHeader";
import { Select } from "../../components/ui/Form";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { ErrorState, LoadingState } from "../../components/ui/Feedback";
import type { EventCategory } from "../../types";

const CATEGORY_LABELS: Record<EventCategory, string> = {
  BROTHERHOOD: "Brotherhood",
  SERVICE: "Service",
  PROFESSIONAL: "Professional",
  RUSH: "Rush",
  ADMIN: "Admin",
};

interface Row {
  userId: string;
  firstName: string;
  lastName: string;
  counts: Record<EventCategory, number>;
}

export default function AttendanceReportPage() {
  const [semesterId, setSemesterId] = useState<string | undefined>(undefined);
  const { data: semesters } = useAsync(() => listSemesters(), []);
  const { data, loading, error, reload } = useAsync(
    () => getAttendanceCategoryReport(semesterId),
    [semesterId]
  );

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
        <ErrorState title="Couldn't load the attendance report" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  const categories = data?.categories ?? [];
  const rows: Row[] = data?.members ?? [];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Member",
      primary: true,
      render: (row) => (
        <span style={{ fontWeight: 600 }}>
          {row.firstName} {row.lastName}
        </span>
      ),
    },
    ...categories.map((category) => ({
      key: category,
      header: CATEGORY_LABELS[category],
      numeric: true,
      render: (row: Row) => (
        <span style={row.counts[category] === 0 ? { color: "var(--color-danger)", fontWeight: 700 } : undefined}>
          {row.counts[category]}
        </span>
      ),
    })),
  ];

  return (
    <div className="page">
      <PageHeader
        title="Attendance Report"
        subtitle={data?.semesterLabel ? `Events attended by category — ${data.semesterLabel}` : "Events attended by category"}
      />

      {semesters && semesters.length > 1 ? (
        <div style={{ marginBottom: "var(--space-4)", maxWidth: 260 }}>
          <Select label="Semester" value={semesterId ?? ""} onChange={(e) => setSemesterId(e.target.value || undefined)}>
            {/* Always names the TRUE current semester, not whichever one
                happens to be selected — see PointsPage.tsx's identical
                picker for why data.semesterLabel alone isn't right here. */}
            <option value="">
              Current{semesters.find((s) => s.isCurrent) ? ` (${semesters.find((s) => s.isCurrent)!.label})` : ""}
            </option>
            {semesters
              .filter((s) => !s.isCurrent)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </Select>
        </div>
      ) : null}

      <DataTable
        caption="Attendance by category"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.userId}
        rowHref={(row) => `/members/${row.userId}`}
      />
    </div>
  );
}
