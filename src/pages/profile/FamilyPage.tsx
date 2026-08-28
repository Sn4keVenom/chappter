// src/pages/profile/FamilyPage.tsx
//
// A member's Big and Littles. Serves both "my family" (/family) and, via the
// `userId` query parameter, another member's — the two cases render very
// differently now:
//
//   · Someone else's family (isSelf === false): read-only. Assigning THEIR
//     Big still happens from their member profile (MemberProfilePage.tsx's
//     "Manage member" panel), which is where that admin permission lives.
//   · Your own family (isSelf === true): self-service. Anyone — including a
//     PNM — can add or remove their own Big; everyone except a PNM can also
//     add or remove Littles for themselves. See backend/routes/
//     membership.routes.ts PATCH /users/:id/big for the authorization rules
//     this mirrors (a PNM has no one to pass initiation guidance to yet, so
//     they can be a Little but can't take one).

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getFamily, setBig } from "../../api/membership";
import { searchMembers } from "../../api/users";
import { useAsync } from "../../hooks/useAsync";
import { useAuthStore } from "../../store/useAuthStore";
import { PageHeader, Section } from "../../components/PageHeader";
import { AssignBigDialog } from "../../components/AssignBigDialog";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import type { FamilyMemberSummary } from "../../types";
import styles from "./ProfilePage.module.css";

function FamilyRow({
  member,
  action,
}: {
  member: FamilyMemberSummary;
  /** A same-row control (e.g. "Remove") rendered instead of the usual "›"
   * chevron — self-service rows are actionable, not just links elsewhere. */
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.row}>
      <Link to={`/members/${member.userId}`} className={styles.rowBody} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
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
      </Link>
      {action ?? (
        <span aria-hidden="true" style={{ color: "var(--color-text-muted)" }}>
          ›
        </span>
      )}
    </div>
  );
}

export default function FamilyPage() {
  const [params] = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const userId = params.get("userId") ?? currentUser?.id;
  const isSelf = userId === currentUser?.id;
  // A PNM can be a Little but can't take one on — see this file's header
  // comment and PATCH /users/:id/big's authorization rules.
  const canManageLittles = isSelf && currentUser?.role !== "PNM";

  const { data, loading, error, reload } = useAsync(
    () => (userId ? getFamily(userId) : Promise.resolve({ big: null, littles: [] })),
    [userId]
  );

  const [bigOpen, setBigOpen] = useState(false);
  const [littleOpen, setLittleOpen] = useState(false);
  const [removingLittle, setRemovingLittle] = useState<FamilyMemberSummary | null>(null);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function removeLittle() {
    if (!removingLittle || !currentUser) return;
    setRemoving(true);
    setActionError(null);
    try {
      await setBig(removingLittle.userId, null);
      setRemovingLittle(null);
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't remove that Little.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title={isSelf ? "My Family" : "Family"}
        subtitle="Big/Little lineage within the chapter."
        backTo={isSelf ? "/profile" : `/members/${userId}`}
        backLabel={isSelf ? "Profile" : "Member"}
      />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Section
        title="Big"
        actions={
          isSelf ? (
            <Button variant="secondary" size="sm" onClick={() => setBigOpen(true)}>
              {data?.big ? "Change Big" : "Add Big"}
            </Button>
          ) : undefined
        }
      >
        <Card>
          {data?.big ? (
            <FamilyRow member={data.big} />
          ) : (
            <EmptyState icon="🌳" title="No Big assigned yet" />
          )}
        </Card>
      </Section>

      <Section
        title={`Littles (${data?.littles.length ?? 0})`}
        actions={
          canManageLittles ? (
            <Button variant="secondary" size="sm" onClick={() => setLittleOpen(true)}>
              Add a Little
            </Button>
          ) : undefined
        }
      >
        <Card>
          {data && data.littles.length > 0 ? (
            data.littles.map((little) => (
              <FamilyRow
                key={little.userId}
                member={little}
                action={
                  canManageLittles ? (
                    <Button variant="ghost" size="sm" onClick={() => setRemovingLittle(little)}>
                      Remove
                    </Button>
                  ) : undefined
                }
              />
            ))
          ) : (
            <EmptyState
              icon="🌱"
              title="No Littles yet"
              body={
                isSelf && !canManageLittles
                  ? "PNMs can't take on Littles yet — that's available once you're initiated."
                  : undefined
              }
            />
          )}
        </Card>
      </Section>

      {isSelf && currentUser ? (
        <>
          <AssignBigDialog
            open={bigOpen}
            role="Big"
            memberName="you"
            currentAssigneeName={data?.big ? `${data.big.firstName} ${data.big.lastName}` : null}
            onClose={() => setBigOpen(false)}
            onAssign={async (bigUserId) => {
              await setBig(currentUser.id, bigUserId);
              await reload({ silent: true });
            }}
            search={(q) => searchMembers(q)}
            showEmail={false}
          />

          <AssignBigDialog
            open={littleOpen}
            role="Little"
            memberName="you"
            currentAssigneeName={null}
            onClose={() => setLittleOpen(false)}
            onAssign={async (littleUserId) => {
              if (!littleUserId) return; // no "remove" affordance offered in this instance
              await setBig(littleUserId, currentUser.id);
              await reload({ silent: true });
            }}
            search={(q) => searchMembers(q)}
            showEmail={false}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={removingLittle !== null}
        onClose={() => setRemovingLittle(null)}
        onConfirm={removeLittle}
        title="Remove this Little?"
        body={
          removingLittle
            ? `${removingLittle.firstName} ${removingLittle.lastName} will no longer have you as their Big.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        busy={removing}
      />
    </div>
  );
}
