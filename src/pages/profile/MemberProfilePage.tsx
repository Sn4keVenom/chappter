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
import { Link, useNavigate, useParams } from "react-router-dom";

import { getMemberProfile, updateUserRole, updateUserFields, deleteMemberAccount } from "../../api/users";
import { getMemberAttendanceHistory } from "../../api/attendance";
import { getFamily, setBig, setRoleNumber } from "../../api/membership";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../store/useAuthStore";
import { PageHeader, Section } from "../../components/PageHeader";
import { AssignBigDialog } from "../../components/AssignBigDialog";
import { Card, CardLabel } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import { Input, Select } from "../../components/ui/Form";
import { ErrorBanner, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { userRoleTone } from "../../theme/semantic";
import { fullName, type ExecOffice, type UserRole } from "../../types";
import { formatShortDate, titleCaseEnum } from "../../utils/format";
import styles from "./ProfilePage.module.css";

const ROLES: UserRole[] = ["PNM", "MEMBER", "EXEC", "ALUMNI", "SUPER_ADMIN"];

// Named exec-board positions. Independent of role by design (see the
// ExecOffice doc comment in schema.prisma) — holding an office never by
// itself changes the role tier, but some permissions are granted BY office
// rather than by role: Scribe assigns role numbers, and Regent/Vice Regent
// post chapter announcements (permissions/permissions.ts
// DEFAULT_OFFICE_PRESETS). "" is the no-office case.
const OFFICES: ExecOffice[] = [
  "REGENT",
  "VICE_REGENT",
  "TREASURER",
  "SCRIBE",
  "MARSHAL",
  "CORRESPONDING_SECRETARY",
  "NEW_MEMBER_EDUCATOR",
];

export default function MemberProfilePage() {
  const navigate = useNavigate();
  const { userId = "" } = useParams();
  const { isExecOrAbove, isSuperAdmin, can } = usePermissions();
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = userId === currentUser?.id;

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteMemberAccount(userId);
      navigate("/admin/roster", { replace: true });
    } catch (e: any) {
      setActionError(e?.message ?? "Couldn't delete this account.");
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

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

              {isSuperAdmin ? (
                <Select
                  label="Exec office"
                  hint="Independent of role — an office grants its own permissions (Scribe assigns role numbers; Regent and Vice Regent post announcements)."
                  value={member.office ?? ""}
                  onChange={async (e) => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      // "" means "no office" — send null, not the empty
                      // string, which the API's enum wouldn't accept.
                      await updateUserFields(userId, {
                        office: e.target.value ? (e.target.value as ExecOffice) : null,
                      });
                      await reload({ silent: true });
                    } catch (err: any) {
                      setActionError(err?.message ?? "Couldn't change the office.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  <option value="">No office</option>
                  {OFFICES.map((office) => (
                    <option key={office} value={office}>
                      {titleCaseEnum(office)}
                    </option>
                  ))}
                </Select>
              ) : null}

              {isSuperAdmin && !isSelf ? (
                <Button variant="danger" block onClick={() => setDeleteOpen(true)}>
                  Delete account
                </Button>
              ) : null}
            </div>
          </Card>
        </Section>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this account?"
        body={`This permanently removes ${member.firstName}'s login. They'd need to sign up again from scratch to rejoin the chapter.`}
        confirmLabel="Delete account"
        destructive
        busy={deleting}
      />

      <AssignBigDialog
        open={bigOpen}
        memberName={member.firstName}
        currentAssigneeName={family.big ? `${family.big.firstName} ${family.big.lastName}` : null}
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
