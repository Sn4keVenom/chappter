// src/pages/admin/AdminHomePage.tsx
//
// Officer/Exec command centre: three at-a-glance stats and shortcuts into the
// tasks each exec office owns. Every section is gated by the permission or
// module that governs it, so a Scribe and a Treasurer see different pages.
//
// On the web most of these shortcuts are also in the sidebar — this page keeps
// them because it adds the numbers that make them actionable ("62% collected",
// "3 committees with pending expenses"), which a nav item can't carry.

import { useState } from "react";

import { getRoster, getLeaderboard } from "../../api/users";
import { getAllDues, sendDuesReminders } from "../../api/dues";
import { listCommittees } from "../../api/committees";
import { listCommitteeBudgets } from "../../api/finance";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { useModulesStore } from "../../store/useModulesStore";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card, CardLabel, CardLink } from "../../components/ui/Card";
import { Button, ButtonLink } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { formatCurrency } from "../../types";

function ActionRow({ to, icon, label, sub }: { to: string; icon: string; label: string; sub: string }) {
  return (
    <CardLink to={to}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            width: 38,
            height: 38,
            borderRadius: "var(--radius-md)",
            background: "var(--color-primary-soft)",
            flex: "none",
          }}
        >
          {icon}
        </span>
        <span style={{ flex: 1, minWidth: 0, display: "block" }}>
          <span style={{ display: "block", fontWeight: 600 }}>{label}</span>
          <span
            style={{
              display: "block",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            {sub}
          </span>
        </span>
        <span aria-hidden="true" style={{ color: "var(--color-text-muted)" }}>
          ›
        </span>
      </div>
    </CardLink>
  );
}

export default function AdminHomePage() {
  const { canViewAdminPanel, isExecOrAbove, isTreasurerOrAdmin, isSuperAdmin, can } = usePermissions();
  const isEventsEnabled = useModulesStore((s) => s.isEnabled("events"));
  const isDuesEnabled = useModulesStore((s) => s.isEnabled("dues"));
  const isCommitteesEnabled = useModulesStore((s) => s.isEnabled("committees"));
  const isFeedbackEnabled = useModulesStore((s) => s.isEnabled("feedback"));

  const [remindersOpen, setRemindersOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const [roster, board, committees] = await Promise.all([
      getRoster({ status: "ACTIVE", limit: 1 }),
      getLeaderboard(),
      listCommittees().catch(() => []),
    ]);

    let duesPaid = 0;
    let duesTotal = 0;
    let owed = 0;
    let paid = 0;
    let semesterId: string | null = null;

    if (isExecOrAbove) {
      try {
        const { records, summary } = await getAllDues();
        semesterId = records[0]?.semesterId ?? null;
        for (const row of summary) {
          duesTotal += row._count._all;
          if (row.status === "PAID" || row.status === "WAIVED") duesPaid += row._count._all;
          owed += Number(row._sum?.amountOwed ?? 0);
          paid += Number(row._sum?.amountPaid ?? 0);
        }
      } catch {
        /* Dues are Exec-only; a 403 here just means this section stays empty. */
      }
    }

    let financeRemaining = 0;
    let financePending = 0;
    if (isTreasurerOrAdmin) {
      try {
        for (const budget of await listCommitteeBudgets()) {
          financeRemaining += budget.remaining;
          if (budget.pending > 0) financePending += 1;
        }
      } catch {
        /* Same: Treasurer-only. */
      }
    }

    return {
      activeMembers: roster.total,
      duesPaid,
      duesTotal,
      owed,
      paid,
      semesterId,
      semesterLabel: board.semesterLabel,
      topPoints: board.leaderboard[0]?.total ?? 0,
      committees,
      financeRemaining,
      financePending,
    };
  }, [isExecOrAbove, isTreasurerOrAdmin]);

  if (!canViewAdminPanel) {
    return (
      <div className="page">
        <RequireAccess message="The admin area is available to officers and above." />
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

  const collectionPct = data && data.owed > 0 ? Math.round((data.paid / data.owed) * 100) : 0;

  async function handleSendReminders() {
    if (!data?.semesterId) return;
    setSending(true);
    try {
      const result = await sendDuesReminders(data.semesterId);
      setNotice(
        result.sent > 0
          ? `Notified ${result.sent} member${result.sent === 1 ? "" : "s"} with outstanding dues.`
          : "No members currently have outstanding dues."
      );
      setRemindersOpen(false);
    } catch (e: any) {
      setNotice(e?.message ?? "Couldn't send reminders.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title="Admin" subtitle={data?.semesterLabel ?? undefined} />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {notice ? (
        <div role="status" style={{ marginBottom: "var(--space-4)" }}>
          <Card>{notice}</Card>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: "var(--space-3)",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          marginBottom: "var(--space-8)",
        }}
      >
        <CardLink to="/admin/roster">
          <CardLabel>Active members</CardLabel>
          <p style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>{data?.activeMembers ?? "—"}</p>
        </CardLink>

        {isExecOrAbove && isDuesEnabled ? (
          <CardLink to="/admin/dues">
            <CardLabel>Dues collected</CardLabel>
            <p
              style={{
                fontSize: "var(--text-2xl)",
                fontWeight: 800,
                color:
                  collectionPct >= 80
                    ? "var(--color-success)"
                    : collectionPct >= 50
                      ? "var(--color-warning)"
                      : "var(--color-danger)",
              }}
            >
              {collectionPct}%
            </p>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              {data?.duesPaid}/{data?.duesTotal} paid
            </p>
          </CardLink>
        ) : null}

        <CardLink to="/points">
          <CardLabel>Top score</CardLabel>
          <p style={{ fontSize: "var(--text-2xl)", fontWeight: 800, color: "var(--color-accent-tint)" }}>
            {data?.topPoints ?? 0}
          </p>
        </CardLink>
      </div>

      {isEventsEnabled ? (
        <Section title="Events">
          <ActionRow
            to="/events"
            icon="◷"
            label="All events"
            sub="Create or manage chapter events — attendance is tracked by the Scribe"
          />
        </Section>
      ) : null}

      <Section title="Members">
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <ActionRow to="/admin/roster" icon="👥" label="Member roster" sub="Search, filter, view all chapter members" />
          {isExecOrAbove ? (
            <ActionRow to="/admin/audit-log" icon="🔒" label="Audit log" sub="All privileged actions and overrides" />
          ) : null}
        </div>
      </Section>

      {can("chapters.manageInvites") ? (
        <Section title="Chapter membership">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <ActionRow to="/admin/invites" icon="🔗" label="Invite codes" sub="Create, edit, archive, and regenerate join codes" />
            <ActionRow to="/admin/join-requests" icon="📥" label="Join requests" sub="Review pending requests to join the chapter" />
          </div>
        </Section>
      ) : null}

      {isExecOrAbove && isDuesEnabled ? (
        <Section title="Dues — Treasurer">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <ActionRow
              to="/admin/dues"
              icon="💰"
              label="Dues overview"
              sub={
                data
                  ? `${formatCurrency(data.paid)} / ${formatCurrency(data.owed)} collected`
                  : "View all dues records"
              }
            />
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <span>
                  <strong style={{ display: "block" }}>Send reminders</strong>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                    Email UNPAID and PARTIAL members
                  </span>
                </span>
                <Button variant="secondary" onClick={() => setRemindersOpen(true)} disabled={!data?.semesterId}>
                  Send
                </Button>
              </div>
            </Card>
          </div>
        </Section>
      ) : null}

      {isTreasurerOrAdmin && isCommitteesEnabled ? (
        <Section title="Finance — Treasurer">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <ActionRow
              to="/admin/budgets"
              icon="🏦"
              label="Committee budgets"
              sub={data ? `${formatCurrency(data.financeRemaining)} remaining across all committees` : "Allocate and track spending"}
            />
            <ActionRow
              to="/admin/expenses"
              icon="🧾"
              label="Expense reimbursements"
              sub={
                data && data.financePending > 0
                  ? `${data.financePending} committee${data.financePending === 1 ? "" : "s"} with pending expenses`
                  : "Review submitted expenses and settle reimbursements"
              }
            />
          </div>
        </Section>
      ) : null}

      {isCommitteesEnabled && (data?.committees.length ?? 0) > 0 ? (
        <Section title="Committees">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {data!.committees.map((committee) => (
              <ActionRow
                key={committee.id}
                to={`/committees/${committee.id}`}
                icon="⬡"
                label={committee.name}
                sub={`${committee.memberCount} ${committee.memberCount === 1 ? "member" : "members"}`}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {isFeedbackEnabled && can("feedback.view") ? (
        <Section title="Feedback">
          <ActionRow to="/admin/feedback" icon="💬" label="Feedback submissions" sub="Review bug reports and feature requests" />
        </Section>
      ) : null}

      {isSuperAdmin ? (
        <Section title="Chapter administration">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <ActionRow to="/settings/chapter" icon="🏛" label="Chapter settings" sub="Semester dates, dues & attendance defaults" />
            <ActionRow to="/settings/modules" icon="🧩" label="Modules" sub="Enable or disable entire app sections" />
            <ActionRow to="/settings/permissions" icon="🔑" label="Permissions" sub="Edit what each role can do" />
            <ActionRow to="/settings/branding" icon="⚜️" label="Chapter branding" sub="Colors, name, and logo" />
          </div>
        </Section>
      ) : null}

      <ConfirmDialog
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        onConfirm={handleSendReminders}
        title="Send dues reminders?"
        body="Emails every member with UNPAID or PARTIAL dues this semester."
        confirmLabel="Send"
        busy={sending}
      />
    </div>
  );
}
