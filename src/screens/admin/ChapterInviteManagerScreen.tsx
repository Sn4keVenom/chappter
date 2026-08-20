// src/screens/admin/ChapterInviteManagerScreen.tsx
//
// Full lifecycle management for chapter invite codes (spec §3/§11 —
// chapters.manageInvites): create, edit, pause/resume, archive, restore, and
// regenerate. A "link" is just the same code embedded in a deep link
// (chapterhub://join?code=XXXX — see RootNavigator's linking config), so
// there's one list, not two.
//
// Everything goes through api/chapters.ts; this screen never touches mock
// data. Demo Mode answers those calls from src/mocks/api.ts, and the two
// operations the real backend hasn't shipped yet (restore, regenerate) are
// declared in the client API with the same signatures they'll have on the
// server — see the note in src/api/branding.ts.
//
// Lifecycle state (Active / Expiring soon / Expired / Use limit reached /
// Paused / Archived) is derived in ONE place — inviteState() in types/index.ts
// — so the badge, the sort order, and the redemption check can't disagree.
//
// Integration:
//   · api/chapters.ts — createInvite/getInvites/updateInvite/archiveInvite/
//     restoreInvite/regenerateInvite
//   · usePermissions  — gated by can("chapters.manageInvites")
//   · hooks/useFocusRefresh — no full-screen reload when returning here

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  Share,
  Switch,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import { colors } from "../../theme/colors";
import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { badgeBackground, inviteStateColor, inviteStateLabel } from "../../theme/semantic";
import { Dialog, DialogActions, DialogButton } from "../../components/Dialog";
import { usePermissions } from "../../hooks/usePermissions";
import { useFocusRefresh } from "../../hooks/useFocusRefresh";
import { useAuthStore } from "../../store/useAuthStore";
import RequireAccess from "../../components/RequireAccess";
import {
  archiveInvite,
  createInvite,
  getInvites,
  regenerateInvite,
  restoreInvite,
  updateInvite,
  type InviteConfig,
} from "../../api/chapters";
import { inviteState } from "../../types";
import type { ChapterInvite, MemberStatus, UserRole } from "../../types";

// Roles an invite can grant. SUPER_ADMIN is deliberately absent — handing out
// full chapter control via a shareable code shouldn't be one tap away;
// promote an existing member from their profile instead.
const INVITE_ROLES: { role: UserRole; status: MemberStatus; label: string; blurb: string }[] = [
  { role: "PNM", status: "PNM", label: "PNM", blurb: "Prospective member — rush and info nights" },
  { role: "MEMBER", status: "ACTIVE", label: "Member", blurb: "Full active member" },
  { role: "EXEC", status: "ACTIVE", label: "Exec", blurb: "Exec board — elevated access" },
  { role: "ALUMNI", status: "ALUMNI", label: "Alumni", blurb: "Graduated member" },
];

const EXPIRY_PRESETS: { label: string; days: number | null }[] = [
  { label: "No expiry", days: null },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const USE_LIMIT_PRESETS: { label: string; value: number | null }[] = [
  { label: "Unlimited", value: null },
  { label: "1", value: 1 },
  { label: "10", value: 10 },
  { label: "50", value: 50 },
];

function inviteLink(code: string): string {
  return `chapterhub://join?code=${code}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Editor dialog (used for both create and edit) ─────────────────────────

interface EditorDraft {
  code: string;
  label: string;
  role: UserRole;
  status: MemberStatus;
  maxUses: number | null;
  expiresAt: string | null;
  active: boolean;
}

function draftFrom(invite: ChapterInvite | null): EditorDraft {
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

function ChipRow({
  options,
  isSelected,
  onSelect,
}: {
  options: { key: string; label: string }[];
  isSelected: (key: string) => boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const selected = isSelected(option.key);
        return (
          <Pressable
            key={option.key}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onSelect(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InviteEditorDialog({
  visible,
  invite,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  /** null = creating a new code. */
  invite: ChapterInvite | null;
  onClose: () => void;
  onSubmit: (config: InviteConfig) => Promise<void>;
}) {
  const { colors } = useTheme();
  const isEditing = invite != null;
  const [draft, setDraft] = useState<EditorDraft>(() => draftFrom(invite));
  const [saving, setSaving] = useState(false);

  // Re-seed when the dialog opens for a different invite. Done during render
  // rather than in an effect so the first frame already shows the right
  // values instead of briefly flashing the previous invite's.
  const seedKey = `${visible}:${invite?.id ?? "new"}`;
  const [lastSeed, setLastSeed] = useState(seedKey);
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey);
    setDraft(draftFrom(invite));
  }

  function set<K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function selectExpiry(days: number | null) {
    if (days == null) {
      set("expiresAt", null);
      return;
    }
    const when = new Date();
    when.setDate(when.getDate() + days);
    set("expiresAt", when.toISOString());
  }

  function expiryPresetKey(): string {
    if (!draft.expiresAt) return "null";
    const daysLeft = Math.round((new Date(draft.expiresAt).getTime() - Date.now()) / 86_400_000);
    const match = EXPIRY_PRESETS.find((p) => p.days === daysLeft);
    return match ? String(match.days) : "custom";
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSubmit({
        // An empty code on create means "server picks one"; on edit the field
        // is pre-filled, so an empty value there means "leave it alone".
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
      Alert.alert(
        isEditing ? "Couldn't save invite" : "Couldn't create invite",
        e?.message ?? "Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const currentExpiry = expiryPresetKey();

  return (
    <Dialog
      visible={visible}
      onRequestClose={onClose}
      title={isEditing ? "Edit invite code" : "New invite code"}
      subtitle={
        isEditing
          ? "Changes apply immediately to anyone who hasn't redeemed it yet."
          : "Configure who this code lets in and how long it lasts."
      }
      maxHeight="86%"
      footer={
        <DialogActions>
          <DialogButton label="Cancel" onPress={onClose} disabled={saving} />
          <DialogButton
            label={isEditing ? "Save" : "Create"}
            variant="primary"
            onPress={handleSubmit}
            busy={saving}
          />
        </DialogActions>
      }
    >
      <ScrollView
        style={styles.editorScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.field}
          value={draft.label}
          onChangeText={(t) => set("label", t)}
          placeholder="e.g. Fall Rush — open link"
          placeholderTextColor={colors.inputPlaceholder}
          keyboardAppearance={colors.keyboardAppearance}
        />
        <Text style={styles.fieldHint}>For your reference in this list only.</Text>

        <Text style={styles.fieldLabel}>Code</Text>
        <TextInput
          style={[styles.field, styles.codeField]}
          value={draft.code}
          onChangeText={(t) => set("code", t.toUpperCase())}
          placeholder={isEditing ? "" : "Leave blank to generate one"}
          placeholderTextColor={colors.inputPlaceholder}
          keyboardAppearance={colors.keyboardAppearance}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={24}
        />
        <Text style={styles.fieldHint}>
          Letters, numbers, and dashes. Generated codes skip vowels and
          look-alike characters so they're easy to read aloud.
        </Text>

        <Text style={styles.fieldLabel}>Joins as</Text>
        <View style={styles.roleList}>
          {INVITE_ROLES.map((option) => {
            const selected = draft.role === option.role;
            return (
              <Pressable
                key={option.role}
                style={[styles.roleOption, selected && styles.roleOptionSelected]}
                onPress={() => setDraft((d) => ({ ...d, role: option.role, status: option.status }))}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.roleBody}>
                  <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>
                    {option.label}
                  </Text>
                  <Text style={styles.roleBlurb}>{option.blurb}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Expires</Text>
        <ChipRow
          options={EXPIRY_PRESETS.map((p) => ({ key: String(p.days), label: p.label }))}
          isSelected={(key) => currentExpiry === key}
          onSelect={(key) => selectExpiry(key === "null" ? null : Number(key))}
        />
        {draft.expiresAt ? (
          <Text style={styles.fieldHint}>Expires {formatDate(draft.expiresAt)}.</Text>
        ) : (
          <Text style={styles.fieldHint}>This code never expires on its own.</Text>
        )}

        <Text style={styles.fieldLabel}>Maximum uses</Text>
        <ChipRow
          options={USE_LIMIT_PRESETS.map((p) => ({ key: String(p.value), label: p.label }))}
          isSelected={(key) => String(draft.maxUses) === key}
          onSelect={(key) => set("maxUses", key === "null" ? null : Number(key))}
        />
        {isEditing && invite ? (
          <Text style={styles.fieldHint}>
            Already used {invite.useCount} time{invite.useCount === 1 ? "" : "s"} — the limit
            can't be set below that.
          </Text>
        ) : null}

        <View style={styles.switchRow}>
          <View style={styles.switchBody}>
            <Text style={styles.switchLabel}>Active</Text>
            <Text style={styles.switchHint}>
              Turn off to pause this code without archiving it. Paused codes can't be
              redeemed but keep their configuration and history.
            </Text>
          </View>
          <Switch
            value={draft.active}
            onValueChange={(v) => set("active", v)}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
          />
        </View>
      </ScrollView>
    </Dialog>
  );
}

// ── Invite card ───────────────────────────────────────────────────────────

function InviteCard({
  invite,
  onEdit,
  onArchive,
  onRestore,
  onRegenerate,
  busy,
}: {
  invite: ChapterInvite;
  onEdit: (invite: ChapterInvite) => void;
  onArchive: (invite: ChapterInvite) => void;
  onRestore: (invite: ChapterInvite) => void;
  onRegenerate: (invite: ChapterInvite) => void;
  busy: boolean;
}) {
  const { colors } = useTheme();
  const state = inviteState(invite);
  const archived = state === "ARCHIVED";
  const stateColor = inviteStateColor(state);
  const redeemable = state === "ACTIVE" || state === "EXPIRING_SOON";

  const usage =
    invite.maxUses != null
      ? `${invite.useCount}/${invite.maxUses} used`
      : `${invite.useCount} use${invite.useCount === 1 ? "" : "s"}`;

  return (
    <View style={[styles.card, archived && styles.cardArchived]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          {invite.label ? (
            <Text style={styles.cardLabel} numberOfLines={1}>
              {invite.label}
            </Text>
          ) : null}
          <Text style={styles.code} selectable>
            {invite.code}
          </Text>
          <View style={styles.badgeRow}>
            <Text
              style={[
                styles.stateBadge,
                { color: stateColor, backgroundColor: badgeBackground(stateColor) },
              ]}
            >
              {inviteStateLabel(state)}
            </Text>
            <Text style={styles.meta}>{invite.role}</Text>
            <Text style={styles.meta}>·</Text>
            <Text style={styles.meta}>{usage}</Text>
          </View>
        </View>

        {/* The QR is the whole point of a live code — it's what gets held up
            at a rush table. Suppressed once the code can't be redeemed, so
            nobody scans a dead one. */}
        {redeemable ? (
          <View style={styles.qrWrap}>
            <QRCode
              value={inviteLink(invite.code)}
              size={64}
              backgroundColor={colors.surface}
              color={colors.textPrimary}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.detailRows}>
        {invite.expiresAt ? (
          <Text style={styles.meta}>
            {state === "EXPIRED" ? "Expired" : "Expires"} {formatDate(invite.expiresAt)}
          </Text>
        ) : (
          <Text style={styles.meta}>No expiry</Text>
        )}
        {invite.lastUsedAt ? (
          <Text style={styles.meta}>Last redeemed {formatDate(invite.lastUsedAt)}</Text>
        ) : (
          <Text style={styles.meta}>Never redeemed</Text>
        )}
        {invite.regeneratedAt ? (
          <Text style={styles.meta}>Regenerated {formatDate(invite.regeneratedAt)}</Text>
        ) : null}
        {archived && invite.revokedAt ? (
          <Text style={styles.meta}>Archived {formatDate(invite.revokedAt)}</Text>
        ) : null}
      </View>

      <View style={styles.cardActions}>
        {archived ? (
          <Pressable
            style={styles.actionBtn}
            onPress={() => onRestore(invite)}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.actionBtnText}>Restore</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={styles.actionBtn}
              onPress={() => onEdit(invite)}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.actionBtnText}>Edit</Text>
            </Pressable>
            {redeemable ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() => Share.share({ message: inviteLink(invite.code) })}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.actionBtnText}>Share</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.actionBtn}
              onPress={() => onRegenerate(invite)}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.actionBtnText}>Regenerate</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.archiveBtn]}
              onPress={() => onArchive(invite)}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={[styles.actionBtnText, styles.archiveBtnText]}>Archive</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────

export default function ChapterInviteManagerScreen() {
  useTheme();
  const { can } = usePermissions();
  const chapterId = useAuthStore((s) => s.user?.chapterId);

  const [invites, setInvites] = useState<ChapterInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ChapterInvite | null>(null);

  const load = useCallback(
    async ({ silent }: { silent: boolean } = { silent: false }) => {
      if (!chapterId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        setInvites(await getInvites(chapterId));
      } catch (e: any) {
        setError(e?.message ?? "Couldn't load invite codes.");
      } finally {
        setLoading(false);
      }
    },
    [chapterId]
  );

  useFocusRefresh(load);

  const { active, archived } = useMemo(() => {
    const now = new Date();
    // Rank by urgency so the codes an admin most likely needs to act on rise
    // to the top: live codes first, then ones about to lapse, then dead ones.
    const rank: Record<string, number> = {
      ACTIVE: 0,
      EXPIRING_SOON: 1,
      PAUSED: 2,
      EXHAUSTED: 3,
      EXPIRED: 4,
      ARCHIVED: 5,
    };
    const sorted = invites.slice().sort((a, b) => {
      const byState = rank[inviteState(a, now)] - rank[inviteState(b, now)];
      return byState !== 0 ? byState : b.createdAt.localeCompare(a.createdAt);
    });
    return {
      active: sorted.filter((i) => inviteState(i, now) !== "ARCHIVED"),
      archived: sorted.filter((i) => inviteState(i, now) === "ARCHIVED"),
    };
  }, [invites]);

  if (!can("chapters.manageInvites")) {
    return <RequireAccess message="You don't have permission to manage invite codes." />;
  }

  async function run(action: () => Promise<unknown>, failureTitle: string) {
    setBusy(true);
    try {
      await action();
      await load({ silent: true });
    } catch (e: any) {
      Alert.alert(failureTitle, e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleArchive(invite: ChapterInvite) {
    Alert.alert(
      "Archive this invite?",
      `${invite.code} can no longer be redeemed. It stays in the archived list so you keep its history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => run(() => archiveInvite(chapterId!, invite.id), "Couldn't archive invite"),
        },
      ]
    );
  }

  function handleRestore(invite: ChapterInvite) {
    run(() => restoreInvite(chapterId!, invite.id), "Couldn't restore invite");
  }

  function handleRegenerate(invite: ChapterInvite) {
    Alert.alert(
      "Regenerate this code?",
      `${invite.code} will stop working immediately. Anyone holding the old code or link — printed flyers, past messages, saved QR codes — will need the new one. Settings and use count are kept.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: () =>
            run(async () => {
              const next = await regenerateInvite(chapterId!, invite.id);
              Alert.alert("New code", `This invite is now ${next.code}.`);
            }, "Couldn't regenerate invite"),
        },
      ]
    );
  }

  async function handleSubmitEditor(config: InviteConfig) {
    if (!chapterId) throw new Error("Your account isn't attached to a chapter yet.");
    if (editing) await updateInvite(chapterId, editing.id, config);
    else await createInvite(chapterId, config);
    await load({ silent: true });
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accentTint} />
      </View>
    );
  }

  function openEditor(invite: ChapterInvite | null) {
    setEditing(invite);
    setEditorOpen(true);
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          style={[styles.createButton, busy && styles.buttonDisabled]}
          onPress={() => openEditor(null)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.createButtonText}>+ New Invite Code</Text>
        </Pressable>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
            <Pressable onPress={() => load()} hitSlop={8}>
              <Text style={styles.errorRetry}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionHeader}>
          Active codes {active.length > 0 ? `(${active.length})` : ""}
        </Text>
        {active.length === 0 ? (
          <Text style={styles.emptyText}>
            No active invite codes. Create one above to let new members join.
          </Text>
        ) : (
          active.map((invite) => (
            <InviteCard
              key={invite.id}
              invite={invite}
              busy={busy}
              onEdit={openEditor}
              onArchive={handleArchive}
              onRestore={handleRestore}
              onRegenerate={handleRegenerate}
            />
          ))
        )}

        <Pressable
          style={styles.archiveToggle}
          onPress={() => setShowArchived((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showArchived }}
        >
          <Text style={styles.archiveToggleText}>
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </Text>
          <Text style={styles.archiveToggleChevron}>{showArchived ? "▲" : "▼"}</Text>
        </Pressable>

        {showArchived ? (
          archived.length === 0 ? (
            <Text style={styles.emptyText}>Nothing archived yet.</Text>
          ) : (
            archived.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                busy={busy}
                onEdit={openEditor}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onRegenerate={handleRegenerate}
              />
            ))
          )
        ) : null}
      </ScrollView>

      <InviteEditorDialog
        visible={editorOpen}
        invite={editing}
        onClose={() => setEditorOpen(false)}
        onSubmit={handleSubmitEditor}
      />
    </View>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },

  createButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  createButtonText: { color: colors.primaryText, fontWeight: "800", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: { flex: 1, fontSize: 12, color: colors.danger, lineHeight: 17 },
  errorRetry: { fontSize: 13, fontWeight: "800", color: colors.danger },

  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardArchived: { backgroundColor: colors.surfaceAlt, borderStyle: "dashed" },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardHeaderText: { flex: 1 },
  cardLabel: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginBottom: 2 },
  code: { fontSize: 21, fontWeight: "800", letterSpacing: 2, color: colors.textPrimary },
  qrWrap: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  badgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8 },
  stateBadge: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: "hidden",
  },
  meta: { fontSize: 12, color: colors.textMuted },

  detailRows: { marginTop: 10, gap: 2 },

  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  actionBtn: {
    flexGrow: 1,
    flexBasis: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  actionBtnText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  archiveBtn: { borderColor: colors.danger, backgroundColor: "transparent" },
  archiveBtnText: { color: colors.danger },

  archiveToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    marginTop: 12,
    marginBottom: 8,
  },
  archiveToggleText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  archiveToggleChevron: { fontSize: 10, color: colors.textMuted },

  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 20,
  },

  // Editor dialog
  editorScroll: { marginTop: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 6,
  },
  field: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.inputText,
    minHeight: 46,
  },
  codeField: { letterSpacing: 2, fontWeight: "700" },
  fieldHint: { fontSize: 11, color: colors.textMuted, marginTop: 6, lineHeight: 15 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  chipTextSelected: { color: colors.primaryText },

  roleList: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: "hidden" },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  roleOptionSelected: { backgroundColor: colors.primarySoft },
  roleBody: { flex: 1 },
  roleLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  roleLabelSelected: { color: colors.primaryTint },
  roleBlurb: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.primaryTint },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryTint },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  switchBody: { flex: 1 },
  switchLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  switchHint: { fontSize: 11, color: colors.textMuted, marginTop: 3, lineHeight: 15 },
}));
