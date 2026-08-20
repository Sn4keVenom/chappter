// src/pages/profile/MemberProfilePage.tsx
//
// Another member's profile. Read-only for everyone; Exec+ additionally sees a
// "Manage member" panel for assigning a Big, setting a role number, changing
// role, and adjusting points.
//
// The Assign Big flow is a two-step dialog — search, then confirm — so a
// change that rewrites someone's lineage always gets a deliberate second
// action rather than firing on a single mis-tap in a list.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getMemberProfile, getRoster, updateUserRole } from "../../api/users";
import { getMemberAttendanceHistory } from "../../api/attendance";
import { getFamily, setBig, setRoleNumber } from "../../api/membership";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input, Select } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { userRoleTone } from "../../theme/semantic";
import { fullName, type UserRole, type UserSummary } from "../../types";
import { formatShortDate, titleCaseEnum } from "../../utils/format";
import styles from "./ProfilePage.module.css";

const ROLES: UserRole[] = ["PNM", "MEMBER", "EXEC", "ALUMNI", "SUPER_ADMIN"];

/** Two-step: pick a member, then confirm. See the note at the top of the file. */
type BigStep = { kind: "search" } | { kind: "confirm"; target: UserSummary | null };

function AssignBigDialog({
  open,
  memberName,
  currentBigName,
  onClose,
  onAssign,
}: {
  open: boolean;
  memberName: string;
  currentBigName: string | null;
  onClose: () => void;
  onAssign: (userId: string | null) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<BigStep>({ kind: "search" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: results, loading } = useAsync(
    () => (open ? getRoster({ q: query, limit: 15 }).then((r) => r.users) : Promise.resolve([])),
    [query, open]
  );

  // Reset whenever the dialog is reopened, so it never resumes mid-flow.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep({ kind: "search" });
      setQuery("");
      setError(null);
    }
  }

  async function commit(userId: string | null) {
    setBusy(true);
    setError(null);
    try {
      await onAssign(userId);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't assign Big.");
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "confirm") {
    const target = step.target;
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={target ? "Assign Big" : "Remove Big"}
        subtitle={
          target
            ? `${target.firstName} ${target.lastName} will become ${memberName}'s Big.`
            : `${memberName} will no longer have a Big assigned.`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep({ kind: "search" })} disabled={busy}>
              Back
            </Button>
            <Button
              variant={target ? "primary" : "dangerSolid"}
              onClick={() => commit(target?.id ?? null)}
              busy={busy}
            >
              Confirm
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        {currentBigName && target ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.55 }}>
            This replaces {currentBigName} as {memberName}'s current Big.
          </p>
        ) : null}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign Big"
      subtitle={`Choose a Big for ${memberName}.`}
      footer={
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Input
        label="Search members"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name or email"
        autoComplete="off"
      />

      {currentBigName ? (
        <Button
          variant="danger"
          block
          onClick={() => setStep({ kind: "confirm", target: null })}
          style={{ marginBottom: "var(--space-4)" }}
        >
          Remove {currentBigName} as Big
        </Button>
      ) : null}

      {loading ? (
        <LoadingState label="Searching…" />
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {(results ?? []).map((user) => (
            <button
              key={user.id}
              type="button"
              className={styles.row}
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => setStep({ kind: "confirm", target: user })}
            >
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>
                  {user.firstName} {user.lastName}
                </span>
                <span className={styles.rowMeta}>{user.email}</span>
              </span>
            </button>
          ))}
          {(results ?? []).length === 0 && query.trim() ? (
            <EmptyState icon="🔍" title="No matches" />
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

export default function MemberProfilePage() {
  const { userId = "" } = useParams();
  const { isExecOrAbove, isSuperAdmin, can } = usePermissions();

  const { data, loading, error, reload } = useAsync(async () => {
    const [member, family, history] = await Promise.all([
      getMemberProfile(userId),
      getFamily(userId).catch(() => ({ big: null, littles: [] })),
      getMemberAttendanceHistory(userId, { limit: 5 }).catch(() => ({ records: [], nextCursor: null })),
    ]);
    return { member, family, history: history.records };
  }, [userId]);

  const [bigOpen, setBigOpen] = useState(false);
  const [roleNumberOpen, setRoleNumberOpen] = useState(false);
  const [roleNumberValue, setRoleNumberValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <ErrorState title="Couldn't load this member" body={error ?? undefined} onRetry={() => reload()} />
      </div>
    );
  }

  const { member, family, history } = data;
  const canManageRelationships = can("membership.manageRelationships") || isExecOrAbove;

  async function saveRoleNumber(value: number | null) {
    setBusy(true);
    setActionError(null);
    try {
      await setRoleNumber(userId, value);
      setRoleNumberOpen(false);
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't save the role number.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title={fullName(member)} backTo="/admin/roster" backLabel="Roster" />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <div className={styles.hero}>
        <span className={styles.avatar} aria-hidden="true">
          {member.firstName[0]}
          {member.lastName[0]}
        </span>
        <div className={styles.heroBody}>
          <p className={styles.name}>{fullName(member)}</p>
          <p className={styles.role}>
            {member.office ? `${titleCaseEnum(member.office)} · ` : ""}
            {member.role}
            {member.roleNumber != null ? ` · #${member.roleNumber}` : ""}
          </p>
          <p className={styles.meta}>
            {[member.major, member.graduationYear ? `Class of ${member.graduationYear}` : null, member.email]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <Card>
          <CardLabel>Membership</CardLabel>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
            <Badge tone={userRoleTone(member.role ?? "MEMBER")} uppercase>
              {member.role}
            </Badge>
            {member.status ? <Badge tone="neutral" uppercase>{member.status}</Badge> : null}
            {member.pledgeClassLabel ? <Badge tone="neutral">{member.pledgeClassLabel}</Badge> : null}
          </div>
        </Card>

        <Card>
          <CardLabel>Family</CardLabel>
          <p style={{ marginTop: "var(--space-2)" }}>
            Big:{" "}
            {family.big ? (
              <Link to={`/members/${family.big.userId}`}>
                {family.big.firstName} {family.big.lastName}
              </Link>
            ) : (
              <span style={{ color: "var(--color-text-muted)" }}>None</span>
            )}
          </p>
          <p>Littles: {family.littles.length}</p>
          <Link to={`/family?userId=${userId}`} style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>
            View family ›
          </Link>
        </Card>

        {(member.committeeMemberships?.length ?? 0) > 0 ? (
          <Card>
            <CardLabel>Committees</CardLabel>
            {member.committeeMemberships!.map((membership) => (
              <Link
                key={membership.committeeId}
                to={`/committees/${membership.committeeId}`}
                className={styles.row}
              >
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle}>{membership.committeeName}</span>
                </span>
                <Badge tone="neutral" uppercase>
                  {membership.role}
                </Badge>
              </Link>
            ))}
          </Card>
        ) : null}

        {history.length > 0 ? (
          <Card>
            <CardLabel>Recent attendance</CardLabel>
            {history.map((entry) => (
              <Link key={entry.id} to={`/events/${entry.event.id}`} className={styles.row}>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle}>{entry.event.title}</span>
                  <span className={styles.rowMeta}>
                    {formatShortDate(entry.event.startTime)}
                    {entry.late ? " · Late" : ""}
                  </span>
                </span>
                <span className={styles.rowValue} style={{ color: "var(--color-success)" }}>
                  +{entry.pointsAwarded}
                </span>
              </Link>
            ))}
          </Card>
        ) : null}
      </div>

      {isExecOrAbove ? (
        <Section title="Manage member">
          <Card>
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              <ButtonLink to={`/members/${userId}/points`} variant="secondary" block>
                ⭐ Adjust points
              </ButtonLink>

              {canManageRelationships ? (
                <>
                  <Button variant="secondary" block onClick={() => setBigOpen(true)}>
                    Assign Big
                  </Button>
                  <Button
                    variant="secondary"
                    block
                    onClick={() => {
                      setRoleNumberValue(member.roleNumber != null ? String(member.roleNumber) : "");
                      setRoleNumberOpen(true);
                    }}
                  >
                    Set role number
                  </Button>
                </>
              ) : null}

              {isSuperAdmin ? (
                <Select
                  label="Role"
                  hint="Changing a role changes what this member can do across the app."
                  value={member.role ?? "MEMBER"}
                  onChange={async (e) => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      await updateUserRole(userId, e.target.value as UserRole);
                      await reload({ silent: true });
                    } catch (err: any) {
                      setActionError(err?.message ?? "Couldn't change the role.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {titleCaseEnum(role)}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </Card>
        </Section>
      ) : null}

      <AssignBigDialog
        open={bigOpen}
        memberName={member.firstName}
        currentBigName={family.big ? `${family.big.firstName} ${family.big.lastName}` : null}
        onClose={() => setBigOpen(false)}
        onAssign={async (bigUserId) => {
          await setBig(userId, bigUserId);
          await reload({ silent: true });
        }}
      />

      <Dialog
        open={roleNumberOpen}
        onClose={() => setRoleNumberOpen(false)}
        title="Role number"
        subtitle="The member's number within the chapter's initiation order."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleNumberOpen(false)} disabled={busy}>
              Cancel
            </Button>
            {member.roleNumber != null ? (
              <Button variant="danger" onClick={() => saveRoleNumber(null)} disabled={busy}>
                Clear
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => saveRoleNumber(Number(roleNumberValue.trim()))}
              busy={busy}
              disabled={!roleNumberValue.trim()}
            >
              Save
            </Button>
          </>
        }
      >
        <Input
          label="Role number"
          type="number"
          inputMode="numeric"
          value={roleNumberValue}
          onChange={(e) => setRoleNumberValue(e.target.value)}
          placeholder="e.g. 214"
          autoFocus
        />
      </Dialog>
    </div>
  );
}
