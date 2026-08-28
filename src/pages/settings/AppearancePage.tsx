// src/pages/settings/AppearancePage.tsx
//
// The user's PERSONAL appearance preference — System / Light / Dark. Stored
// in localStorage and never sent to the server: a per-person, per-device
// choice, deliberately independent of the chapter-wide branding an admin
// controls one section over.
//
// Selecting a mode applies it immediately. Because the palette lives in CSS
// custom properties on <html>, the whole document repaints in one style
// recalculation — no component re-renders, and nothing in the navigation or
// the page behind resets.

import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { ChoiceList } from "../../components/ui/Form";
import { useTheme } from "../../theme/ThemeProvider";
import { useThemeStore, type ThemeMode } from "../../theme/useThemeStore";
import { buildPalette, type ColorScheme } from "../../theme/palette";
import styles from "./AppearancePage.module.css";

const OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  {
    value: "system",
    label: "Match device",
    hint: "Follows your operating system's Light/Dark setting, including its schedule.",
  },
  { value: "light", label: "Light", hint: "Always light, whatever your device is set to." },
  { value: "dark", label: "Dark", hint: "Always dark, whatever your device is set to." },
];

/**
 * Miniature of the app in a specific scheme. Built from the real palette
 * rather than hard-coded swatches, so it always reflects the chapter's current
 * branding and can't drift from what the app actually looks like.
 */
function SchemePreview({ scheme, label }: { scheme: ColorScheme; label: string }) {
  const { branding } = useTheme();
  const p = buildPalette(scheme, branding);

  return (
    <div className={styles.previewColumn}>
      <div className={styles.preview} style={{ background: p.background, borderColor: p.border }}>
        <div className={styles.previewHeader} style={{ background: p.headerBackground }}>
          <span className={styles.previewHeaderBar} style={{ background: p.headerText }} />
        </div>
        <div className={styles.previewCard} style={{ background: p.surface, borderColor: p.border }}>
          <span className={styles.previewLine} style={{ background: p.textPrimary, width: "70%" }} />
          <span className={styles.previewLine} style={{ background: p.textMuted, width: "45%" }} />
          <span className={styles.previewPill} style={{ background: p.primary }} />
        </div>
        <div
          className={styles.previewNav}
          style={{ background: p.tabBarBackground, borderTopColor: p.tabBarBorder }}
        >
          <span className={styles.previewDot} style={{ background: p.tabBarActive }} />
          <span className={styles.previewDot} style={{ background: p.tabBarInactive }} />
          <span className={styles.previewDot} style={{ background: p.tabBarInactive }} />
        </div>
      </div>
      <p className={styles.previewLabel}>{label}</p>
    </div>
  );
}

export default function AppearancePage() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const { scheme } = useTheme();

  return (
    <div>
      <PageHeader
        title="Appearance"
        subtitle="How Chappter looks on this device."
        backTo="/settings"
        backLabel="Settings"
      />

      <Section title="Preview">
        <div className={styles.previewRow}>
          <SchemePreview scheme="light" label="Light" />
          <SchemePreview scheme="dark" label="Dark" />
        </div>
        <p className={styles.hint}>
          Previews use your chapter's colors. Currently showing the{" "}
          {scheme === "dark" ? "dark" : "light"} theme.
        </p>
      </Section>

      <Section title="Theme">
        <ChoiceList legend="Theme" options={OPTIONS} value={mode} onChange={setMode} />
        <p className={styles.footnote}>
          This setting is saved in this browser only. It doesn't change what
          other members of your chapter see.
        </p>
      </Section>

      <Card>
        <p style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Active theme
        </p>
        <p style={{ fontSize: "var(--text-md)", fontWeight: 700, marginTop: "var(--space-1)" }}>
          {scheme === "dark" ? "Dark" : "Light"}
          {mode === "system" ? " (following your device)" : ""}
        </p>
      </Card>
    </div>
  );
}
