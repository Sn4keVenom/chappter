// src/pages/profile/ProfilePage.tsx
//
// The signed-in member's own profile: points and rank, dues status with
// self-service payment, achievements, committee memberships, and recent
// attendance. On desktop these become a two-column card grid rather than one
// long scroll.

import { useState } from "react";
import { Link } from "react-router-dom";

import { getLeaderboard, getMe, getPointsLedger } from "../../api/users";
import { getMyDues, payDuesWithPyli } from "../../api/dues";
import { getMyAttendanceHistory } from "../../api/attendance";
import { computeAchievements } from "../../utils/achievements";
import { useAsync } from "../../hooks/useAsync";
import { useModulesStore } from "../../store/useModulesStore";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card, CardLabel } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { ChoiceList } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { duesStatusTone } from "../../theme/semantic";
import { formatCurrency, fullName, type DuesPlan, type DuesRecord } from "../../types";
import { formatShortDate, titleCaseEnum } from "../../utils/format";
import styles from "./ProfilePage.module.css";

const MONTHLY_INSTALLMENTS = 3;

/**
 * Pay-with-Pyli. Pyli is the chapter's external payment provider; this
 * deliberately isn't a real payment integration (no card entry, no SDK). It's
 * an honest stand-in: pick a plan, the payment posts exactly as an
 * officer-recorded one would, just self-initiated.
 */
function PyliDialog({
  open,
  dues,
  onClose,
  onPaid,
}: {
  open: boolean;
  dues: DuesRecord | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [plan, setPlan] = useState<DuesPlan>("FULL");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!dues) return null;

  const remaining = dues.amountOwed - dues.amountPaid;
  const installment = Math.min(remaining, Math.ceil(dues.amountOwed / MONTHLY_INSTALLMENTS));
  const amount = plan === "FULL" ? remaining : installment;

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      await payDuesWithPyli({ semesterId: dues!.semesterId, amount, plan });
      onPaid();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Could not process payment via Pyli.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pay dues with Pyli"
      subtitle={`${dues.semester.label} · ${formatCurrency(remaining)} remaining`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={paying}>
            Cancel
          </Button>
          <Button variant="primary" onClick={pay} busy={paying}>
            Pay {formatCurrency(amount)}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <ChoiceList
        legend="Payment plan"
        value={plan}
        onChange={(next) => setPlan(next as DuesPlan)}
        options={[
          { value: "FULL", label: "Pay in full", hint: formatCurrency(remaining) },
          {
            value: "MONTHLY",
            label: "Monthly",
            hint: `${formatCurrency(installment)}/mo — first installment charged now, ${MONTHLY_INSTALLMENTS} total`,
          },
        ]}
      />
    </Dialog>
  );
}

export default function ProfilePage() {
  const isPointsEnabled = useModulesStore((s) => s.isEnabled("points"));
  const isDuesEnabled = useModulesStore((s) => s.isEnabled("dues"));
  const [payOpen, setPayOpen] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [me, duesRecords, history, board] = await Promise.all([
      getMe(),
      getMyDues(),
      getMyAttendanceHistory({ limit: 5 }),
      getLeaderboard(),
    ]);
    const self = board.leaderboard.find((entry) => entry.userId === me.id);
    const ledger = await getPointsLedger(me.id, { limit: 200 });

    return {
      me,
      dues: duesRecords[0] ?? null,
      history: history.records,
      rank: self?.rank ?? null,
      total: self?.total ?? 0,
      semesterLabel: board.semesterLabel,
      achievements: computeAchievements({
        totalPoints: self?.total ?? 0,
        rank: self?.rank ?? null,
        attendanceCount: ledger.entries.filter((e) => e.type === "ATTENDANCE").length,
        lateCount: history.records.filter((r) => r.late).length,
        bonusCount: ledger.entries.filter((e) => e.type === "BONUS").length,
        duesStatus: duesRecords[0]?.status ?? null,
        committeeCount: me.committeeMemberships?.length ?? 0,
      }),
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  const me = data?.me;
  const dues = data?.dues ?? null;

  return (
    <div className="page">
      <PageHeader
        title="Profile"
        actions={
          <>
            <ButtonLink to="/profile/edit" variant="secondary">
              Edit profile
            </ButtonLink>
            <ButtonLink to="/settings" variant="secondary">
              Settings
            </ButtonLink>
          </>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}

      {me ? (
        <div className={styles.hero}>
          <span className={styles.avatar} aria-hidden="true">
            {me.firstName[0]}
          </span>
          <div className={styles.heroBody}>
            <p className={styles.name}>{fullName(me)}</p>
            {me.username ? <p className={styles.username}>@{me.username}</p> : null}
            <p className={styles.role}>
              {me.office ? `${titleCaseEnum(me.office)} · ` : ""}
              {me.role}
              {me.roleNumber != null ? ` · #${me.roleNumber}` : ""}
            </p>
            <p className={styles.meta}>
              {[me.major, me.graduationYear ? `Class of ${me.graduationYear}` : null, me.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {me.pledgeClassLabel ? <p className={styles.meta}>{me.pledgeClassLabel}</p> : null}
          </div>
        </div>
      ) : null}

      <div className={styles.grid}>
        {isPointsEnabled ? (
          <Card>
            <CardLabel>Points{data?.semesterLabel ? ` — ${data.semesterLabel}` : ""}</CardLabel>
            <div className={styles.statRow}>
              <span className={styles.statValue}>{data?.total ?? 0}</span>
              {data?.rank ? <Badge tone="accent">#{data.rank}</Badge> : null}
            </div>
            <Link to="/points" style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>
              View leaderboard ›
            </Link>
          </Card>
        ) : null}

        {isDuesEnabled && dues ? (
          <Card accentColor={`var(--color-${duesStatusTone(dues.status) === "neutral" ? "text-muted" : duesStatusTone(dues.status)})`}>
            <CardLabel>Dues — {dues.semester.label}</CardLabel>
            <div className={styles.duesRow}>
              <Badge tone={duesStatusTone(dues.status)} uppercase>
                {dues.status}
              </Badge>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                {formatCurrency(dues.amountPaid)} paid of {formatCurrency(dues.amountOwed)}
              </span>
            </div>
            {dues.plan ? (
              <p className={styles.rowMeta}>
                {dues.plan === "MONTHLY" ? "Monthly plan via Pyli" : "Paid in full via Pyli"}
              </p>
            ) : null}
            {dues.dueDate && dues.status !== "PAID" && dues.status !== "WAIVED" ? (
              <p className={styles.rowMeta} style={{ color: "var(--color-warning)" }}>
                Due {formatShortDate(dues.dueDate)}
              </p>
            ) : null}
            {dues.status === "UNPAID" || dues.status === "PARTIAL" ? (
              <Button
                variant="primary"
                block
                onClick={() => setPayOpen(true)}
                style={{ marginTop: "var(--space-3)" }}
              >
                Pay with Pyli
              </Button>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <CardLabel>Family</CardLabel>
          <Link to="/family" style={{ fontSize: "var(--text-base)", fontWeight: 700 }}>
            View my Big &amp; Littles ›
          </Link>
        </Card>

        {me?.teamId && me.teamName ? (
          <Card>
            <CardLabel>Team</CardLabel>
            <Link to={`/teams/${me.teamId}`} style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>
              {me.teamName} ›
            </Link>
          </Card>
        ) : null}

        {data && data.achievements.length > 0 ? (
          <Card className={styles.wide}>
            <CardLabel>Achievements</CardLabel>
            <div className={styles.badgeGrid} style={{ marginTop: "var(--space-3)" }}>
              {data.achievements.map((achievement) => (
                <span
                  key={achievement.id}
                  className={[styles.achievement, achievement.earned ? "" : styles.achievementLocked]
                    .filter(Boolean)
                    .join(" ")}
                  title={achievement.earned ? "Earned" : "Not yet earned"}
                >
                  <span aria-hidden="true">{achievement.icon}</span>
                  {achievement.label}
                  {achievement.earned ? <span className="sr-only"> (earned)</span> : <span className="sr-only"> (locked)</span>}
                </span>
              ))}
            </div>
          </Card>
        ) : null}

        {(me?.committeeMemberships?.length ?? 0) > 0 ? (
          <Card>
            <CardLabel>Committees</CardLabel>
            {me!.committeeMemberships!.map((membership) => (
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

        {data && data.history.length > 0 ? (
          <Card>
            <CardLabel>Recent attendance</CardLabel>
            {data.history.map((entry) => (
              <Link key={entry.id} to={`/events/${entry.event.id}`} className={styles.row}>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle}>{entry.event.title}</span>
                  <span className={styles.rowMeta}>
                    {formatShortDate(entry.event.startTime)}
                    {entry.late ? " · Late" : ""} · {entry.method === "MANUAL" ? "Manual" : "QR"}
                  </span>
                </span>
                <span
                  className={styles.rowValue}
                  style={{ color: entry.late ? "var(--color-warning)" : "var(--color-success)" }}
                >
                  +{entry.pointsAwarded}
                </span>
              </Link>
            ))}
          </Card>
        ) : data ? (
          <Card>
            <CardLabel>Recent attendance</CardLabel>
            <EmptyState icon="📋" title="No attendance yet" body="Check in at an event to start earning points." />
          </Card>
        ) : null}
      </div>

      <PyliDialog open={payOpen} dues={dues} onClose={() => setPayOpen(false)} onPaid={() => reload({ silent: true })} />
    </div>
  );
}
