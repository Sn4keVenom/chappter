// src/pages/committees/CommitteesPage.tsx
//
// Committee index. New in the web app: the mobile build had no committee
// list — committees were only reachable from the admin panel or a member's
// profile. On the web a top-level navigation item needs a destination, and a
// browsable list is what people expect at /committees.

import { listCommittees } from "../../api/committees";
import { useAsync } from "../../hooks/useAsync";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardLink } from "../../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/Feedback";

export default function CommitteesPage() {
  const { data, loading, error, reload } = useAsync(() => listCommittees(), []);

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
        <ErrorState title="Couldn't load committees" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  const committees = data ?? [];

  return (
    <div className="page">
      <PageHeader title="Committees" subtitle="Every committee in the chapter." />

      {committees.length === 0 ? (
        <Card>
          <EmptyState icon="⬡" title="No committees yet" />
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "var(--space-3)",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {committees.map((committee) => (
            <CardLink key={committee.id} to={`/committees/${committee.id}`}>
              <p style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{committee.name}</p>
              {committee.description ? (
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginTop: "var(--space-1)" }}>
                  {committee.description}
                </p>
              ) : null}
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-3)" }}>
                {committee.memberCount} member{committee.memberCount === 1 ? "" : "s"}
              </p>
            </CardLink>
          ))}
        </div>
      )}
    </div>
  );
}
