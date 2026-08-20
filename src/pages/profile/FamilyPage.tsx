// src/pages/profile/FamilyPage.tsx
//
// A member's Big and Littles. Read-only here for everyone — assigning a Big
// happens from a member's profile, which is where the permission to do it
// lives. Serves both "my family" (/family) and, via the `userId` query
// parameter, another member's.

import { Link, useSearchParams } from "react-router-dom";

import { getFamily } from "../../api/membership";
import { useAsync } from "../../hooks/useAsync";
import { useAuthStore } from "../../store/useAuthStore";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/Feedback";
import type { FamilyMemberSummary } from "../../types";
import styles from "./ProfilePage.module.css";

function FamilyRow({ member }: { member: FamilyMemberSummary }) {
  return (
    <Link to={`/members/${member.userId}`} className={styles.row}>
      <span className={styles.avatar} style={{ width: 40, height: 40, fontSize: "var(--text-sm)" }} aria-hidden="true">
        {member.firstName[0]}
        {member.lastName[0]}
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>
          {member.firstName} {member.lastName}
        </span>
        {member.roleNumber != null ? <span className={styles.rowMeta}>#{member.roleNumber}</span> : null}
      </span>
      <span aria-hidden="true" style={{ color: "var(--color-text-muted)" }}>
        ›
      </span>
    </Link>
  );
}

export default function FamilyPage() {
  const [params] = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const userId = params.get("userId") ?? currentUser?.id;
  const isSelf = userId === currentUser?.id;

  const { data, loading, error, reload } = useAsync(
    () => (userId ? getFamily(userId) : Promise.resolve({ big: null, littles: [] })),
    [userId]
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
        <ErrorState title="Couldn't load family info" body={error} onRetry={() => reload()} />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title={isSelf ? "My Family" : "Family"}
        subtitle="Big/Little lineage within the chapter."
        backTo={isSelf ? "/profile" : `/members/${userId}`}
        backLabel={isSelf ? "Profile" : "Member"}
      />

      <Section title="Big">
        <Card>
          {data?.big ? (
            <FamilyRow member={data.big} />
          ) : (
            <EmptyState icon="🌳" title="No Big assigned yet" />
          )}
        </Card>
      </Section>

      <Section title={`Littles (${data?.littles.length ?? 0})`}>
        <Card>
          {data && data.littles.length > 0 ? (
            data.littles.map((little) => <FamilyRow key={little.userId} member={little} />)
          ) : (
            <EmptyState icon="🌱" title="No Littles yet" />
          )}
        </Card>
      </Section>
    </div>
  );
}
