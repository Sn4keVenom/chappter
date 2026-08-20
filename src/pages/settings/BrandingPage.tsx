// src/pages/settings/BrandingPage.tsx
//
// Chapter-wide visual identity: primary + accent color, display name and
// letters, logo, and optional background tints. Server-owned config gated by
// settings.manage — distinct from the personal Light/Dark preference.
//
// Two behaviours worth knowing about:
//
//   · LIVE PREVIEW. Every edit is pushed through useThemeStore.previewBranding
//     immediately, which rewrites the CSS custom properties on <html> — so the
//     sidebar, header, and buttons all repaint as you type. You are looking at
//     the real app in the candidate colors, not a mock-up. Nothing is
//     persisted until Save; leaving with unsaved edits reverts.
//
//   · CONTRAST GUARDRAILS. An admin can enter any hex. Rather than blocking
//     that, the palette builder derives readable foregrounds automatically
//     (theme/contrast.ts) and this page reports the resulting ratios for both
//     Light and Dark, flagging anything below the WCAG AA body-text floor.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Form";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { ErrorBanner } from "../../components/ui/Feedback";
import RequireAccess from "../../components/RequireAccess";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../store/useAuthStore";
import { useThemeStore } from "../../theme/useThemeStore";
import { brandContrastReport, buildPalette } from "../../theme/palette";
import { BRANDING_PRESETS, DEFAULT_BRANDING } from "../../theme/branding";
import { isValidHex, normalizeHex } from "../../theme/contrast";
import type { ChapterBranding } from "../../types";
import styles from "./BrandingPage.module.css";

/** WCAG AA floor for body text. Anything under this is flagged. */
const AA_BODY = 4.5;

const SUGGESTED_SWATCHES = [
  "#1B2A4A", "#25405E", "#0F4C5C", "#1F4D3D", "#4B2E83", "#8E2436",
  "#B4531F", "#C8952F", "#C8A24A", "#2B2F36", "#3E9BD6", "#E76F51",
];

const LOGO_MARKS = ["⚜️", "🦅", "⚙️", "🛡️", "🔱", "🌟", "🐺", "🏛️"];

const EDITABLE_KEYS = [
  "chapterName",
  "chapterLetters",
  "logoEmoji",
  "logoUrl",
  "primaryColor",
  "accentColor",
  "backgroundTintLight",
  "backgroundTintDark",
] as const;

function ColorField({
  label,
  hint,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (hex: string | null) => void;
  allowNone?: boolean;
}) {
  // Local text state so a partially typed hex ("#1B2") isn't rejected
  // mid-keystroke; the committed value only changes once it parses.
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);

  const emptyOk = text.trim() === "" && allowNone;
  const valid = emptyOk || isValidHex(text);

  function commit(next: string) {
    setText(next);
    const trimmed = next.trim();
    if (trimmed === "" && allowNone) onChange(null);
    else if (isValidHex(trimmed)) onChange(normalizeHex(trimmed));
  }

  return (
    <div>
      <div className={styles.colorRow}>
        {/* A native color input is the fastest way to pick; the hex field next
            to it is the precise way. Both write the same value. */}
        <input
          type="color"
          className={styles.colorInput}
          value={value ?? "#000000"}
          onChange={(e) => commit(e.target.value)}
          aria-label={`${label} color picker`}
        />
        <div className={styles.colorField}>
          <Input
            label={label}
            hint={valid ? hint : undefined}
            error={valid ? undefined : "Enter a hex color like #1B2A4A."}
            value={text}
            onChange={(e) => commit(e.target.value)}
            placeholder={allowNone ? "None" : "#1B2A4A"}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={7}
          />
        </div>
      </div>
      <div className={styles.swatchGrid}>
        {SUGGESTED_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => commit(hex)}
            className={[styles.swatchChip, value === hex ? styles.swatchChipSelected : ""]
              .filter(Boolean)
              .join(" ")}
            style={{ background: hex }}
            aria-label={`Use ${hex}`}
            aria-pressed={value === hex}
          />
        ))}
        {allowNone ? (
          <Button size="sm" variant="ghost" onClick={() => commit("")}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PreviewCard({ branding }: { branding: ChapterBranding }) {
  return (
    <div className={styles.previewRow}>
      {(["light", "dark"] as const).map((scheme) => {
        const p = buildPalette(scheme, branding);
        return (
          <div key={scheme}>
            <div className={styles.preview} style={{ background: p.background, borderColor: p.border }}>
              <div className={styles.previewHeader} style={{ background: p.headerBackground }}>
                <span className={styles.previewHeaderText} style={{ color: p.headerText }}>
                  {branding.chapterName || "Chapter"}
                </span>
              </div>
              <div className={styles.previewCard} style={{ background: p.surface, borderColor: p.border }}>
                <p className={styles.previewTitle} style={{ color: p.textPrimary }}>
                  Chapter Meeting
                </p>
                <p className={styles.previewSub} style={{ color: p.textMuted }}>
                  Tonight · 7:00 PM
                </p>
                <span
                  className={styles.previewBadge}
                  style={{ background: p.accentSoft, borderColor: p.accentSoftBorder, color: p.accentTint }}
                >
                  Required
                </span>
                <div className={styles.previewButton} style={{ background: p.primary, color: p.primaryText }}>
                  RSVP
                </div>
                <span className={styles.previewLink} style={{ color: p.link }}>
                  View details ›
                </span>
              </div>
              <div
                className={styles.previewNav}
                style={{ background: p.tabBarBackground, borderTopColor: p.tabBarBorder }}
              >
                <span style={{ color: p.tabBarActive }}>⌂</span>
                <span style={{ color: p.tabBarInactive }}>◷</span>
                <span style={{ color: p.tabBarInactive }}>✉</span>
              </div>
            </div>
            <p className={styles.previewLabel}>{scheme === "light" ? "Light" : "Dark"}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function BrandingPage() {
  const { can } = usePermissions();
  const chapterId = useAuthStore((s) => s.user?.chapterId);

  // NOT s.branding — that carries the live preview, so a draft compared
  // against it would never look dirty and Save would never enable.
  const committed = useThemeStore((s) => s.committedBranding);
  const brandingError = useThemeStore((s) => s.brandingError);
  const previewBranding = useThemeStore((s) => s.previewBranding);
  const saveBranding = useThemeStore((s) => s.saveBranding);
  const resetBranding = useThemeStore((s) => s.resetBranding);

  const [draft, setDraft] = useState<ChapterBranding>(committed);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const savedRef = useRef(false);
  // Until the admin has actually edited something, the draft must keep
  // tracking `committed` — otherwise opening this page before the branding
  // fetch resolves leaves the editor showing defaults, and Save would
  // overwrite the chapter's real colors with them.
  const touchedRef = useRef(false);

  useEffect(() => {
    if (!touchedRef.current) setDraft(committed);
  }, [committed]);

  const update = useCallback(<K extends keyof ChapterBranding>(key: K, value: ChapterBranding[K]) => {
    touchedRef.current = true;
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  useEffect(() => {
    previewBranding(draft);
  }, [draft, previewBranding]);

  // Leaving without saving must not leave the app painted in an abandoned
  // draft — revert to the last server-committed branding on unmount.
  useEffect(
    () => () => {
      if (!savedRef.current) previewBranding(null);
    },
    [previewBranding]
  );

  const dirty = useMemo(
    () => EDITABLE_KEYS.some((k) => (draft[k] ?? null) !== (committed[k] ?? null)),
    [draft, committed]
  );

  const report = useMemo(() => brandContrastReport(draft), [draft]);
  const anyLow = report.some((r) => r.primaryOnBackground < AA_BODY);

  if (!can("settings.manage")) {
    return <RequireAccess message="Only chapter administrators can change chapter branding." />;
  }

  async function handleSave() {
    if (!chapterId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveBranding(chapterId, {
        chapterName: draft.chapterName.trim(),
        chapterLetters: draft.chapterLetters.trim(),
        logoEmoji: draft.logoEmoji ?? null,
        logoUrl: draft.logoUrl?.trim() || null,
        primaryColor: draft.primaryColor,
        accentColor: draft.accentColor,
        backgroundTintLight: draft.backgroundTintLight ?? null,
        backgroundTintDark: draft.backgroundTintDark ?? null,
      });
      savedRef.current = true;
      touchedRef.current = false;
    } catch (e: any) {
      setSaveError(e?.message ?? "Couldn't save branding. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!chapterId) return;
    setSaving(true);
    try {
      const next = await resetBranding(chapterId);
      savedRef.current = true;
      touchedRef.current = false;
      setDraft(next);
      setResetOpen(false);
    } catch (e: any) {
      setSaveError(e?.message ?? "Couldn't reset branding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Chapter Branding"
        subtitle="Colors, name, and logo — applied for everyone in the chapter."
        backTo="/settings"
        backLabel="Settings"
      />

      {brandingError ? <ErrorBanner message={brandingError} /> : null}
      {saveError ? <ErrorBanner message={saveError} /> : null}

      <Section title="Preview">
        <PreviewCard branding={draft} />
        <p className={styles.hint}>
          The app around this page is already showing these colors. Nothing is
          saved for your chapter until you choose Save.
        </p>
      </Section>

      <Section title="Presets">
        <div className={styles.presetGrid}>
          {BRANDING_PRESETS.map((preset) => {
            const selected =
              draft.primaryColor === preset.primaryColor && draft.accentColor === preset.accentColor;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                className={[styles.preset, selected ? styles.presetSelected : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  touchedRef.current = true;
                  setDraft((d) => ({
                    ...d,
                    primaryColor: preset.primaryColor,
                    accentColor: preset.accentColor,
                    backgroundTintLight: preset.backgroundTintLight ?? null,
                    backgroundTintDark: preset.backgroundTintDark ?? null,
                  }));
                }}
              >
                <span className={styles.presetSwatches}>
                  <span className={styles.presetSwatch} style={{ background: preset.primaryColor }} />
                  <span className={styles.presetSwatch} style={{ background: preset.accentColor }} />
                </span>
                <span className={styles.presetLabel}>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Identity">
        <Input
          label="Chapter name"
          value={draft.chapterName}
          onChange={(e) => update("chapterName", e.target.value)}
          placeholder="Theta Tau — Beta Chapter"
        />
        <Input
          label="Letters"
          hint="Shown as the monogram when there's no logo."
          value={draft.chapterLetters}
          onChange={(e) => update("chapterLetters", e.target.value)}
          placeholder="ΘΤ"
        />

        <fieldset style={{ border: "none", padding: 0, marginBottom: "var(--space-4)" }}>
          <legend
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 700,
              color: "var(--color-text-secondary)",
              marginBottom: "var(--space-2)",
            }}
          >
            Logo mark
          </legend>
          <div className={styles.markRow}>
            {LOGO_MARKS.map((mark) => (
              <button
                key={mark}
                type="button"
                aria-pressed={draft.logoEmoji === mark}
                aria-label={`Use ${mark} as the logo mark`}
                className={[styles.mark, draft.logoEmoji === mark ? styles.markSelected : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => update("logoEmoji", draft.logoEmoji === mark ? null : mark)}
              >
                {mark}
              </button>
            ))}
          </div>
          <p className={styles.hint}>Choose again to clear and fall back to the chapter letters.</p>
        </fieldset>

        <Input
          label="Logo image URL"
          hint="Optional. Uploading a file isn't supported yet — paste a hosted URL, or leave blank to use the mark above."
          value={draft.logoUrl ?? ""}
          onChange={(e) => update("logoUrl", e.target.value || null)}
          placeholder="https://…"
          type="url"
          autoCapitalize="none"
        />
      </Section>

      <Section title="Colors">
        <ColorField
          label="Primary"
          hint="Buttons, header bar, avatars, selected states."
          value={draft.primaryColor}
          onChange={(hex) => hex && update("primaryColor", hex)}
        />
        <ColorField
          label="Accent"
          hint="Active navigation, rank badges, required-event tags."
          value={draft.accentColor}
          onChange={(hex) => hex && update("accentColor", hex)}
        />
      </Section>

      <Section title="Background tint (optional)">
        <ColorField
          label="Light mode tint"
          hint="A very subtle wash over backgrounds and cards. Leave empty for neutral."
          value={draft.backgroundTintLight ?? null}
          onChange={(hex) => update("backgroundTintLight", hex)}
          allowNone
        />
        <ColorField
          label="Dark mode tint"
          value={draft.backgroundTintDark ?? null}
          onChange={(hex) => update("backgroundTintDark", hex)}
          allowNone
        />
      </Section>

      <Section title="Accessibility">
        <Card>
          {report.map((r) => {
            const ok = r.primaryOnBackground >= AA_BODY;
            return (
              <div key={r.scheme} className={styles.contrastRow}>
                <span className={styles.contrastScheme}>{r.scheme === "light" ? "Light" : "Dark"}</span>
                <span className={styles.contrastMetric}>
                  Primary on background {r.primaryOnBackground.toFixed(1)}:1
                </span>
                <Badge tone={ok ? "success" : "warning"}>{ok ? "AA" : "Low"}</Badge>
              </div>
            );
          })}
          <p className={styles.contrastNote}>
            Text and icons placed on your primary and accent colors are chosen
            automatically for contrast, so labels stay readable whatever you
            pick.{" "}
            {anyLow
              ? "The colors flagged above still work as fills, but links and small text using them will be faint."
              : "Both themes clear the WCAG AA body-text threshold."}
          </p>
        </Card>
      </Section>

      <div className={styles.actions}>
        <Button variant="primary" onClick={handleSave} disabled={!dirty} busy={saving}>
          {dirty ? "Save branding" : "No changes"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            touchedRef.current = false;
            setDraft(committed);
            previewBranding(null);
          }}
          disabled={!dirty || saving}
        >
          Discard changes
        </Button>
        <Button variant="danger" onClick={() => setResetOpen(true)} disabled={saving}>
          Reset to default
        </Button>
      </div>

      <p className={styles.hint}>
        Branding applies to everyone in the chapter and works alongside each
        member's own Light/Dark preference — it never overrides it. Default
        colors: {DEFAULT_BRANDING.primaryColor} / {DEFAULT_BRANDING.accentColor}.
      </p>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title="Reset branding?"
        body="This restores the chapter's default colors, name, and logo for everyone."
        confirmLabel="Reset"
        destructive
        busy={saving}
      />
    </div>
  );
}
