// src/pages/admin/InvitesPage.tsx
//
// Full lifecycle management for chapter invite codes: create, edit, pause,
// archive, restore, and regenerate. A "link" is the same code embedded in a
// join URL, so there is one list, not two.
//
// Everything goes through api/chapters.ts — the page never touches mock data.
// Demo Mode answers those calls from src/mocks/api.ts; the two operations the
// real backend hasn't shipped yet (restore, regenerate) are declared in the
// client API with the signatures they'll have on the server.
//
// Lifecycle state is derived in ONE place — inviteState() in types/index.ts —
// so the badge, the sort order, and the redemption check cannot disagree.
//
// Layout: a responsive card grid rather than DataTable. Each invite carries a
// QR code and four actions, which a table row cannot hold legibly even on a
// wide screen — so the cards simply reflow into columns as space allows.

import { useMemo, useState } from "react";

import {
  archiveInvite,
  createInvite,
  getInvites,
  regenerateInvite,
  restoreInvite,
  updateInvite,
  type InviteConfig,
} from "../../api/chapters";
import { inviteState, type ChapterInvite, type MemberStatus, type UserRole } from "../../types";
import { useAsync } from "../../hooks/useAsync";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../store/useAuthStore";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { QRCode } from "../../components/ui/QRCode";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import { ChipGroup, ChoiceList, Input, Switch } from "../../components/ui/Form";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import { inviteStateLabel, inviteStateTone } from "../../theme/semantic";
import { formatFullDate } from "../../utils/format";
import styles from "./InvitesPage.module.css";

// Roles an invite can grant. SUPER_ADMIN is deliberately absent — handing out
// full chapter control via a shareable code shouldn't be one tap away.
const INVITE_ROLES: { value: UserRole; label: string; hint: string; status: MemberStatus }[] = [
  { value: "PNM", label: "PNM", hint: "Prospective member — rush and info nights", status: "PNM" },
  { value: "MEMBER", label: "Member", hint: "Full active member", status: "ACTIVE" },
  { value: "EXEC", label: "Exec", hint: "Exec board — elevated access", status: "ACTIVE" },
  { value: "ALUMNI", label: "Alumni", hint: "Graduated member", status: "ALUMNI" },
];

const EXPIRY_PRESETS = [
  { value: "null", label: "No expiry", days: null as number | null },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
];

const USE_LIMITS = [
  { value: "null", label: "Unlimited" },
  { value: "1", label: "1" },
  { value: "10", label: "10" },
  { value: "50", label: "50" },
];

function inviteLink(code: string): string {
  return `${window.location.origin}/join?code=${code}`;
}

interface Draft {
  code: string;
  label: string;
  role: UserRole;
  status: MemberStatus;
  maxUses: number | null;
  expiresAt: string | null;
  active: boolean;
}

function draftFrom(invite: ChapterInvite | null): Draft {
  if (!invite) {
    return { code: "", label: "", role: "PNM", status: "PNM", maxUses: null, expiresAt: null, active: true };
  }
  return {
    code: invite.code,
    label: invite.label ?? "",
    role: invite.role,
    status: invite.status,
    maxUses: invite.maxUses ?? null,
    expiresAt: invite.expiresAt ?? null,
    active: invite.active,
  };
}

function InviteEditor({
  open,
  invite,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** null = creating. */
  invite: ChapterInvite | null;
  onClose: () => void;
  onSubmit: (config: InviteConfig) => Promise<void>;
}) {
  const isEditing = invite != null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(invite));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed when the dialog opens for a different invite. Done during render
  // rather than in an effect so the first frame already shows the right
  // values instead of flashing the previous invite's.
  const seedKey = `${open}:${invite?.id ?? "new"}`;
  const [lastSeed, setLastSeed] = useState(seedKey);
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey);
    setDraft(draftFrom(invite));
    setError(null);
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function currentExpiryKey(): string {
    if (!draft.expiresAt) return "null";
    const days = Math.round((new Date(draft.expiresAt).getTime() - Date.now()) / 86_400_000);
    return EXPIRY_PRESETS.find((p) => p.days === days)?.value ?? "custom";
  }

  function selectExpiry(key: string) {
    const preset = EXPIRY_PRESETS.find((p) => p.value === key);
    if (!preset || preset.days == null) {
      set("expiresAt", null);
      return;
    }
    const when = new Date();
    when.setDate(when.getDate() + preset.days);
    set("expiresAt", when.toISOString());
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        // Empty on create means "server picks one"; on edit the field is
        // pre-filled, so empty there means "leave it alone".
        ...(draft.code.trim() ? { code: draft.code.trim().toUpperCase() } : {}),
        label: draft.label.trim() || null,
        role: draft.role,
        status: draft.status,
        maxUses: draft.maxUses,
        expiresAt: draft.expiresAt,
        active: draft.active,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit invite code" : "New invite code"}
      subtitle={
        isEditing
          ? "Changes apply immediately to anyone who hasn't redeemed it yet."
          : "Configure who this code lets in and how long it lasts."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} busy={saving}>
            {isEditing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}

      <Input
        label="Name"
        hint="For your reference in this list only."
        value={draft.label}
        onChange={(e) => set("label", e.target.value)}
        placeholder="e.g. Fall Rush — open link"
      />

      <Input
        label="Code"
        hint="Letters, numbers, and dashes. Generated codes skip vowels and look-alike characters so they're easy to read aloud."
        value={draft.code}
        onChange={(e) => set("code", e.target.value.toUpperCase())}
        placeholder={isEditing ? "" : "Leave blank to generate one"}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={24}
        style={{ letterSpacing: "0.12em", fontFamily: "var(--font-mono)" }}
      />

      <fieldset style={{ border: "none", padding: 0, marginBottom: "var(--space-4)" }}>
        <legend className={styles.label} style={{ marginBottom: "var(--space-2)" }}>
          Joins as
        </legend>
        <ChoiceList
          legend="Joins as"
          options={INVITE_ROLES.map(({ value, label, hint }) => ({ value, label, hint }))}
          value={draft.role}
          onChange={(role) => {
            const match = INVITE_ROLES.find((r) => r.value === role)!;
            setDraft((d) => ({ ...d, role, status: match.status }));
          }}
        />
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, marginBottom: "var(--space-4)" }}>
        <legend className={styles.label} style={{ marginBottom: "var(--space-2)" }}>
          Expires
        </legend>
        <ChipGroup
          label="Expiry"
          options={EXPIRY_PRESETS.map(({ value, label }) => ({ value, label }))}
          isSelected={(v) => currentExpiryKey() === v}
          onSelect={selectExpiry}
        />
        <p className={styles.meta} style={{ marginTop: "var(--space-2)" }}>
          {draft.expiresAt
            ? `Expires ${formatFullDate(draft.expiresAt)}.`
            : "This code never expires on its own."}
        </p>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, marginBottom: "var(--space-4)" }}>
        <legend className={styles.label} style={{ marginBottom: "var(--space-2)" }}>
          Maximum uses
        </legend>
        <ChipGroup
          label="Maximum uses"
          options={USE_LIMITS}
          isSelected={(v) => String(draft.maxUses) === v}
          onSelect={(v) => set("maxUses", v === "null" ? null : Number(v))}
        />
        {isEditing && invite ? (
          <p className={styles.meta} style={{ marginTop: "var(--space-2)" }}>
            Already used {invite.useCount} time{invite.useCount === 1 ? "" : "s"} — the limit can't
            be set below that.
          </p>
        ) : null}
      </fieldset>

      <Switch
        checked={draft.active}
        onChange={(v) => set("active", v)}
        label="Active"
        hint="Turn off to pause this code without archiving it. Paused codes can't be redeemed but keep their configuration and history."
      />
    </Dialog>
  );
}

function InviteCard({
  invite,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onRegenerate,
  onShowQr,
}: {
  invite: ChapterInvite;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onRegenerate: () => void;
  onShowQr: () => void;
}) {
  const state = inviteState(invite);
  const archived = state === "ARCHIVED";
  const redeemable = state === "ACTIVE" || state === "EXPIRING_SOON";

  const usage =
    invite.maxUses != null
      ? `${invite.useCount}/${invite.maxUses} used`
      : `${invite.useCount} use${invite.useCount === 1 ? "" : "s"}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink(invite.code));
    } catch {
      /* Clipboard unavailable (insecure context) — the QR dialog still shows
         the full link for manual copying. */
    }
  }

  return (
    <Card as="li" className={archived ? styles.cardArchived : undefined}>
      <div className={styles.inviteCard}>
        <div className={styles.inviteBody}>
          {invite.label ? <p className={styles.label}>{invite.label}</p> : null}
          <p className={styles.codeLarge + " " + styles.code}>{invite.code}</p>
          <div className={styles.badgeRow} style={{ marginTop: "var(--space-2)" }}>
            <Badge tone={inviteStateTone(state)} uppercase>
              {inviteStateLabel(state)}
            </Badge>
            <span className={styles.meta}>{invite.role}</span>
            <span className={styles.meta}>·</span>
            <span className={styles.meta}>{usage}</span>
          </div>

          <div className={styles.inviteDetails}>
            <span className={styles.meta}>
              {invite.expiresAt
                ? `${state === "EXPIRED" ? "Expired" : "Expires"} ${formatFullDate(invite.expiresAt)}`
                : "No expiry"}
            </span>
            <span className={styles.meta}>
              {invite.lastUsedAt ? `Last redeemed ${formatFullDate(invite.lastUsedAt)}` : "Never redeemed"}
            </span>
            {invite.regeneratedAt ? (
              <span className={styles.meta}>Regenerated {formatFullDate(invite.regeneratedAt)}</span>
            ) : null}
            {archived && invite.revokedAt ? (
              <span className={styles.meta}>Archived {formatFullDate(invite.revokedAt)}</span>
            ) : null}
          </div>
        </div>

        {/* The QR is the point of a live code — it's what gets held up at a
            rush table. Suppressed once the code can't be redeemed so nobody
            scans a dead one. */}
        {redeemable ? (
          <QRCode value={inviteLink(invite.code)} size={84} alt={`QR code for invite ${invite.code}`} />
        ) : null}
      </div>

      <div className={styles.actions}>
        {archived ? (
          <Button size="sm" variant="secondary" onClick={onRestore} disabled={busy}>
            Restore
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={onEdit} disabled={busy}>
              Edit
            </Button>
            {redeemable ? (
              <>
                <Button size="sm" variant="secondary" onClick={copyLink} disabled={busy}>
                  Copy link
                </Button>
                <Button size="sm" variant="secondary" onClick={onShowQr} disabled={busy}>
                  Show QR
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="secondary" onClick={onRegenerate} disabled={busy}>
              Regenerate
            </Button>
            <Button size="sm" variant="danger" onClick={onArchive} disabled={busy}>
              Archive
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export default function InvitesPage() {
  const { can } = usePermissions();
  const chapterId = useAuthStore((s) => s.user?.chapterId);

  const { data, loading, error, reload } = useAsync(
    () => (chapterId ? getInvites(chapterId) : Promise.resolve([])),
    [chapterId]
  );

  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ChapterInvite | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ChapterInvite | null>(null);
  const [regenTarget, setRegenTarget] = useState<ChapterInvite | null>(null);
  const [qrTarget, setQrTarget] = useState<ChapterInvite | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const invites = data ?? [];

  const { active, archived } = useMemo(() => {
    const now = new Date();
    // Rank by urgency so the codes most likely to need attention rise to the
    // top: live codes first, then ones about to lapse, then dead ones.
    const rank: Record<string, number> = {
      ACTIVE: 0,
      EXPIRING_SOON: 1,
      PAUSED: 2,
      EXHAUSTED: 3,
      EXPIRED: 4,
      ARCHIVED: 5,
    };
    const sorted = invites
      .slice()
      .sort((a, b) =>
        rank[inviteState(a, now)] - rank[inviteState(b, now)] ||
        b.createdAt.localeCompare(a.createdAt)
      );
    return {
      active: sorted.filter((i) => inviteState(i, now) !== "ARCHIVED"),
      archived: sorted.filter((i) => inviteState(i, now) === "ARCHIVED"),
    };
  }, [invites]);

  if (!can("chapters.manageInvites")) {
    return (
      <div className="page">
        <RequireAccess message="You don't have permission to manage invite codes." />
      </div>
    );
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await reload({ silent: true });
    } catch (e: any) {
      setActionError(e?.message ?? failure);
    } finally {
      setBusy(false);
    }
  }

  async function submitEditor(config: InviteConfig) {
    if (!chapterId) throw new Error("Your account isn't attached to a chapter yet.");
    if (editing) await updateInvite(chapterId, editing.id, config);
    else await createInvite(chapterId, config);
    await reload({ silent: true });
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Invite Codes"
        subtitle="Create, edit, archive, and regenerate the codes people use to join your chapter."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            + New invite code
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Section title={`Active codes${active.length ? ` (${active.length})` : ""}`}>
        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon="🔗"
              title="No active invite codes"
              body="Create one above to let new members join."
            />
          </Card>
        ) : (
          <ul className={styles.cards}>
            {active.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                busy={busy}
                onEdit={() => {
                  setEditing(invite);
                  setEditorOpen(true);
                }}
                onArchive={() => setArchiveTarget(invite)}
                onRestore={() => run(() => restoreInvite(chapterId!, invite.id), "Couldn't restore invite.")}
                onRegenerate={() => setRegenTarget(invite)}
                onShowQr={() => setQrTarget(invite)}
              />
            ))}
          </ul>
        )}
      </Section>

      <button
        type="button"
        className={styles.archiveToggle}
        onClick={() => setShowArchived((v) => !v)}
        aria-expanded={showArchived}
      >
        {showArchived ? "Hide" : "Show"} archived ({archived.length})
        <span aria-hidden="true">{showArchived ? "▲" : "▼"}</span>
      </button>

      {showArchived ? (
        <Section>
          {archived.length === 0 ? (
            <Card>
              <EmptyState icon="🗂" title="Nothing archived yet" />
            </Card>
          ) : (
            <ul className={styles.cards}>
              {archived.map((invite) => (
                <InviteCard
                  key={invite.id}
                  invite={invite}
                  busy={busy}
                  onEdit={() => {
                    setEditing(invite);
                    setEditorOpen(true);
                  }}
                  onArchive={() => setArchiveTarget(invite)}
                  onRestore={() =>
                    run(() => restoreInvite(chapterId!, invite.id), "Couldn't restore invite.")
                  }
                  onRegenerate={() => setRegenTarget(invite)}
                  onShowQr={() => setQrTarget(invite)}
                />
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <InviteEditor
        open={editorOpen}
        invite={editing}
        onClose={() => setEditorOpen(false)}
        onSubmit={submitEditor}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => {
          const target = archiveTarget;
          setArchiveTarget(null);
          if (target) run(() => archiveInvite(chapterId!, target.id), "Couldn't archive invite.");
        }}
        title="Archive this invite?"
        body={
          archiveTarget
            ? `${archiveTarget.code} can no longer be redeemed. It stays in the archived list so you keep its history.`
            : undefined
        }
        confirmLabel="Archive"
        destructive
        busy={busy}
      />

      <ConfirmDialog
        open={regenTarget !== null}
        onClose={() => setRegenTarget(null)}
        onConfirm={() => {
          const target = regenTarget;
          setRegenTarget(null);
          if (target) run(() => regenerateInvite(chapterId!, target.id), "Couldn't regenerate invite.");
        }}
        title="Regenerate this code?"
        body={
          regenTarget
            ? `${regenTarget.code} will stop working immediately. Anyone holding the old code or link — printed flyers, past messages, saved QR codes — will need the new one. Settings and use count are kept.`
            : undefined
        }
        confirmLabel="Regenerate"
        destructive
        busy={busy}
      />

      <Dialog
        open={qrTarget !== null}
        onClose={() => setQrTarget(null)}
        title={qrTarget ? `Invite ${qrTarget.code}` : "Invite"}
        subtitle="Scan this code, or share the link below, to join the chapter."
      >
        {qrTarget ? (
          <div className={styles.qrPanel}>
            <QRCode value={inviteLink(qrTarget.code)} size={220} alt={`QR code for invite ${qrTarget.code}`} />
            <p className={styles.qrCaption}>{inviteLink(qrTarget.code)}</p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
