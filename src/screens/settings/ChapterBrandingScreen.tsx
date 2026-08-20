// src/screens/settings/ChapterBrandingScreen.tsx
//
// Chapter-wide visual identity: primary + accent color, display name and
// letters, logo, and optional background tints. Distinct from the personal
// Light/Dark preference next door — this is server-owned config that applies
// to every member of the chapter, gated by settings.manage.
//
// Two behaviors worth knowing about:
//
//   · LIVE PREVIEW. Every edit is pushed through useThemeStore.previewBranding
//     immediately, so the header, buttons, and the preview card below all
//     repaint as you type — you're looking at the real app in the candidate
//     colors, not a mock-up. Nothing is persisted until Save; leaving the
//     screen with unsaved edits reverts to the last committed branding.
//
//   · CONTRAST GUARDRAILS. An admin can enter any hex. Rather than blocking
//     that, the palette builder derives readable foreground colors
//     automatically (theme/contrast.ts) and this screen reports the resulting
//     ratios for both Light and Dark, flagging anything that falls under the
//     WCAG AA body-text floor before it's saved.
//
// Integration:
//   · api/branding.ts via useThemeStore — getChapterBranding/update/reset
//   · theme/palette.ts — buildPalette + brandContrastReport for the preview
//   · theme/branding.ts — BRANDING_PRESETS

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { makeStyles } from "../../theme/makeStyles";
import { useTheme } from "../../theme/ThemeProvider";
import { useThemeStore } from "../../theme/useThemeStore";
import { brandContrastReport, buildPalette } from "../../theme/palette";
import { BRANDING_PRESETS, DEFAULT_BRANDING } from "../../theme/branding";
import { isValidHex, normalizeHex } from "../../theme/contrast";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { useAuthStore } from "../../store/useAuthStore";
import type { ChapterBranding } from "../../types";

/** WCAG AA floor for body text. Anything under this gets flagged. */
const AA_BODY = 4.5;

const SUGGESTED_SWATCHES = [
  "#1B2A4A", "#25405E", "#0F4C5C", "#1F4D3D", "#4B2E83", "#8E2436",
  "#B4531F", "#C8952F", "#C8A24A", "#2B2F36", "#3E9BD6", "#E76F51",
];

const LOGO_MARKS = ["⚜️", "🦅", "⚙️", "🛡️", "🔱", "🌟", "🐺", "🏛️"];

function Field({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  autoCapitalize?: "none" | "words";
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.field}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inputPlaceholder}
        autoCapitalize={autoCapitalize ?? "words"}
        autoCorrect={false}
        keyboardAppearance={colors.keyboardAppearance}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

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
  const { colors } = useTheme();
  // Local text state so a partially typed hex ("#1B2") doesn't get rejected
  // mid-keystroke; the committed value only changes once it parses.
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);

  const valid = text.trim() === "" ? allowNone : isValidHex(text);

  function commit(next: string) {
    setText(next);
    const trimmed = next.trim();
    if (trimmed === "" && allowNone) onChange(null);
    else if (isValidHex(trimmed)) onChange(normalizeHex(trimmed));
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.hexRow}>
        <View
          style={[
            styles.hexSwatch,
            { backgroundColor: value ?? colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          {value ? null : <Text style={styles.hexSwatchNone}>—</Text>}
        </View>
        <TextInput
          style={[styles.field, styles.hexInput, !valid && styles.fieldInvalid]}
          value={text}
          onChangeText={commit}
          placeholder={allowNone ? "None" : "#1B2A4A"}
          placeholderTextColor={colors.inputPlaceholder}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          keyboardAppearance={colors.keyboardAppearance}
        />
        {allowNone && value ? (
          <Pressable style={styles.clearBtn} onPress={() => commit("")} hitSlop={8}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {!valid ? (
        <Text style={styles.fieldError}>Enter a hex color like #1B2A4A.</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}

      <View style={styles.swatchGrid}>
        {SUGGESTED_SWATCHES.map((hex) => (
          <Pressable
            key={hex}
            onPress={() => commit(hex)}
            style={[
              styles.swatchChip,
              { backgroundColor: hex },
              value === hex && styles.swatchChipSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Use ${hex}`}
          />
        ))}
      </View>
    </View>
  );
}

function PreviewCard({ branding }: { branding: ChapterBranding }) {
  return (
    <View style={styles.previewRow}>
      {(["light", "dark"] as const).map((scheme) => {
        const p = buildPalette(scheme, branding);
        return (
          <View key={scheme} style={styles.previewColumn}>
            <View style={[styles.preview, { backgroundColor: p.background, borderColor: p.border }]}>
              <View style={[styles.previewHeader, { backgroundColor: p.headerBackground }]}>
                <Text style={[styles.previewHeaderText, { color: p.headerText }]} numberOfLines={1}>
                  {branding.chapterName || "Chapter"}
                </Text>
              </View>
              <View style={[styles.previewCard, { backgroundColor: p.surface, borderColor: p.border }]}>
                <Text style={[styles.previewTitle, { color: p.textPrimary }]}>Chapter Meeting</Text>
                <Text style={[styles.previewSub, { color: p.textMuted }]}>Tonight · 7:00 PM</Text>
                <View style={styles.previewChips}>
                  <View style={[styles.previewBadge, { backgroundColor: p.accentSoft, borderColor: p.accentSoftBorder }]}>
                    <Text style={[styles.previewBadgeText, { color: p.accentTint }]}>Required</Text>
                  </View>
                </View>
                <View style={[styles.previewButton, { backgroundColor: p.primary }]}>
                  <Text style={[styles.previewButtonText, { color: p.primaryText }]}>RSVP</Text>
                </View>
                <Text style={[styles.previewLink, { color: p.link }]}>View details ›</Text>
              </View>
              <View style={[styles.previewTabBar, { backgroundColor: p.tabBarBackground, borderTopColor: p.tabBarBorder }]}>
                <Text style={[styles.previewTabIcon, { color: p.tabBarActive }]}>⌂</Text>
                <Text style={[styles.previewTabIcon, { color: p.tabBarInactive }]}>◷</Text>
                <Text style={[styles.previewTabIcon, { color: p.tabBarInactive }]}>✉</Text>
              </View>
            </View>
            <Text style={styles.previewLabel}>{scheme === "light" ? "Light" : "Dark"}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function ChapterBrandingScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { can } = usePermissions();
  const chapterId = useAuthStore((s) => s.user?.chapterId);

  const committed = useThemeStore((s) => s.branding);
  const brandingError = useThemeStore((s) => s.brandingError);
  const previewBranding = useThemeStore((s) => s.previewBranding);
  const saveBranding = useThemeStore((s) => s.saveBranding);
  const resetBranding = useThemeStore((s) => s.resetBranding);

  // Seeded from what's committed; from then on the draft is the source of
  // truth for this screen (the store's copy tracks the live preview).
  const [draft, setDraft] = useState<ChapterBranding>(committed);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  // Whether the admin has actually changed anything yet. Until they have, the
  // draft must keep tracking `committed` — otherwise opening this screen
  // before the branding fetch resolves (a cold start straight into Settings,
  // or a slow network) leaves the editor showing DEFAULT_BRANDING, and
  // hitting Save would overwrite the chapter's real colors with defaults.
  const touchedRef = useRef(false);

  useEffect(() => {
    if (!touchedRef.current) setDraft(committed);
  }, [committed]);

  const update = useCallback(<K extends keyof ChapterBranding>(key: K, value: ChapterBranding[K]) => {
    touchedRef.current = true;
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  // Push the draft into the live theme so the whole app previews it.
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
    () =>
      (["chapterName", "chapterLetters", "logoEmoji", "logoUrl", "primaryColor", "accentColor", "backgroundTintLight", "backgroundTintDark"] as const)
        .some((k) => (draft[k] ?? null) !== (committed[k] ?? null)),
    [draft, committed]
  );

  const report = useMemo(() => brandContrastReport(draft), [draft]);
  const warnings = report.filter((r) => r.primaryOnBackground < AA_BODY);

  if (!can("settings.manage")) {
    return <RequireAccess message="Only chapter administrators can change chapter branding." />;
  }

  async function handleSave() {
    if (!chapterId) {
      Alert.alert("No chapter", "Your account isn't attached to a chapter yet.");
      return;
    }
    setSaving(true);
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
      Alert.alert("Branding saved", "Every member of the chapter will see these colors.");
    } catch (e: any) {
      Alert.alert("Couldn't save branding", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    Alert.alert(
      "Reset branding?",
      "This restores the chapter's default colors, name, and logo for everyone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            if (!chapterId) return;
            setSaving(true);
            try {
              const next = await resetBranding(chapterId);
              savedRef.current = true;
              touchedRef.current = false;
              setDraft(next);
            } catch (e: any) {
              Alert.alert("Couldn't reset", e?.message ?? "Please try again.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  function handleDiscard() {
    touchedRef.current = false;
    setDraft(committed);
    previewBranding(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {brandingError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{brandingError}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionHeader}>Preview</Text>
        <PreviewCard branding={draft} />
        <Text style={styles.hint}>
          The whole app is already showing these colors. Nothing is saved for
          your chapter until you tap Save.
        </Text>

        <Text style={styles.sectionHeader}>Presets</Text>
        <View style={styles.presetRow}>
          {BRANDING_PRESETS.map((preset) => {
            const selected =
              draft.primaryColor === preset.primaryColor && draft.accentColor === preset.accentColor;
            return (
              <Pressable
                key={preset.id}
                style={[styles.preset, selected && styles.presetSelected]}
                onPress={() => {
                  touchedRef.current = true;
                  setDraft((d) => ({
                    ...d,
                    primaryColor: preset.primaryColor,
                    accentColor: preset.accentColor,
                    backgroundTintLight: preset.backgroundTintLight ?? null,
                    backgroundTintDark: preset.backgroundTintDark ?? null,
                  }));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.presetSwatches}>
                  <View style={[styles.presetSwatch, { backgroundColor: preset.primaryColor }]} />
                  <View style={[styles.presetSwatch, { backgroundColor: preset.accentColor }]} />
                </View>
                <Text style={[styles.presetLabel, selected && styles.presetLabelSelected]} numberOfLines={2}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionHeader}>Identity</Text>
        <Field
          label="Chapter name"
          value={draft.chapterName}
          onChangeText={(t) => update("chapterName", t)}
          placeholder="Theta Tau — Beta Chapter"
        />
        <Field
          label="Letters"
          hint="Shown as the monogram when there's no logo."
          value={draft.chapterLetters}
          onChangeText={(t) => update("chapterLetters", t)}
          placeholder="ΘΤ"
        />

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Logo mark</Text>
          <View style={styles.markRow}>
            {LOGO_MARKS.map((mark) => (
              <Pressable
                key={mark}
                style={[styles.mark, draft.logoEmoji === mark && styles.markSelected]}
                onPress={() => update("logoEmoji", draft.logoEmoji === mark ? null : mark)}
                accessibilityRole="button"
                accessibilityState={{ selected: draft.logoEmoji === mark }}
              >
                <Text style={styles.markText}>{mark}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldHint}>
            Tap again to clear and fall back to the chapter letters.
          </Text>
        </View>

        <Field
          label="Logo image URL"
          hint="Optional. Uploading an image file isn't supported yet — paste a hosted URL, or leave blank to use the mark above."
          value={draft.logoUrl ?? ""}
          onChangeText={(t) => update("logoUrl", t || null)}
          placeholder="https://…"
          autoCapitalize="none"
        />

        <Text style={styles.sectionHeader}>Colors</Text>
        <ColorField
          label="Primary"
          hint="Buttons, header bar, avatars, selected states."
          value={draft.primaryColor}
          onChange={(hex) => hex && update("primaryColor", hex)}
        />
        <ColorField
          label="Accent"
          hint="Active tab, rank badges, required-event tags."
          value={draft.accentColor}
          onChange={(hex) => hex && update("accentColor", hex)}
        />

        <Text style={styles.sectionHeader}>Background tint (optional)</Text>
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

        <Text style={styles.sectionHeader}>Accessibility</Text>
        <View style={styles.contrastCard}>
          {report.map((r) => {
            const ok = r.primaryOnBackground >= AA_BODY;
            return (
              <View key={r.scheme} style={styles.contrastRow}>
                <Text style={styles.contrastScheme}>{r.scheme === "light" ? "Light" : "Dark"}</Text>
                <Text style={styles.contrastMetric}>
                  Primary on background {r.primaryOnBackground.toFixed(1)}:1
                </Text>
                <Text style={[styles.contrastBadge, ok ? styles.contrastOk : styles.contrastWarn]}>
                  {ok ? "AA" : "Low"}
                </Text>
              </View>
            );
          })}
          <Text style={styles.contrastNote}>
            Text and icons placed on your primary and accent colors are chosen
            automatically for contrast, so labels stay readable whatever you
            pick. {warnings.length > 0
              ? "The colors flagged above are still legible as fills, but links and small text using them will be faint."
              : "Both themes clear the WCAG AA body-text threshold."}
          </Text>
        </View>

        <Pressable
          style={[styles.saveBtn, (!dirty || saving) && styles.btnDisabled]}
          onPress={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.saveBtnText}>{dirty ? "Save branding" : "No changes"}</Text>
          )}
        </Pressable>

        {dirty ? (
          <Pressable style={styles.secondaryBtn} onPress={handleDiscard} disabled={saving}>
            <Text style={styles.secondaryBtnText}>Discard changes</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.resetBtn} onPress={handleReset} disabled={saving}>
          <Text style={styles.resetBtnText}>Reset to chapter default</Text>
        </Pressable>

        <Text style={styles.footnote}>
          Branding applies to everyone in the chapter and works alongside each
          member's own Light/Dark preference — it never overrides it.
          Default colors: {DEFAULT_BRANDING.primaryColor} / {DEFAULT_BRANDING.accentColor}.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 60 },

  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 10,
  },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 10 },
  footnote: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 20 },

  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  errorBannerText: { fontSize: 12, color: colors.danger, lineHeight: 17 },

  // Preview
  previewRow: { flexDirection: "row", gap: 12 },
  previewColumn: { flex: 1 },
  preview: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  previewHeader: { height: 36, justifyContent: "center", paddingHorizontal: 10 },
  previewHeaderText: { fontSize: 11, fontWeight: "800" },
  previewCard: { margin: 10, padding: 10, borderRadius: 10, borderWidth: 1 },
  previewTitle: { fontSize: 13, fontWeight: "700" },
  previewSub: { fontSize: 11, marginTop: 2 },
  previewChips: { flexDirection: "row", marginTop: 8 },
  previewBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  previewBadgeText: { fontSize: 9, fontWeight: "800" },
  previewButton: { borderRadius: 8, paddingVertical: 8, alignItems: "center", marginTop: 10 },
  previewButtonText: { fontSize: 11, fontWeight: "800" },
  previewLink: { fontSize: 11, fontWeight: "600", marginTop: 8 },
  previewTabBar: {
    height: 30,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
  },
  previewTabIcon: { fontSize: 13 },
  previewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },

  // Presets
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preset: {
    width: "31%",
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    alignItems: "center",
    minHeight: 84,
  },
  presetSelected: { borderColor: colors.primaryTint, borderWidth: 2 },
  presetSwatches: { flexDirection: "row", gap: 4, marginBottom: 8 },
  presetSwatch: { width: 20, height: 20, borderRadius: 6 },
  presetLabel: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, textAlign: "center" },
  presetLabelSelected: { color: colors.primaryTint },

  // Fields
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 6 },
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
  fieldInvalid: { borderColor: colors.danger },
  fieldHint: { fontSize: 11, color: colors.textMuted, marginTop: 6, lineHeight: 15 },
  fieldError: { fontSize: 11, color: colors.danger, marginTop: 6 },

  hexRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hexSwatch: {
    width: 46,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  hexSwatchNone: { color: colors.textMuted, fontSize: 16 },
  hexInput: { flex: 1 },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  clearBtnText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },

  swatchGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  swatchChip: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchChipSelected: { borderWidth: 3, borderColor: colors.textPrimary },

  markRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mark: {
    width: 46,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  markSelected: { borderColor: colors.primaryTint, borderWidth: 2, backgroundColor: colors.primarySoft },
  markText: { fontSize: 20 },

  // Contrast report
  contrastCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  contrastRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  contrastScheme: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, width: 46 },
  contrastMetric: { flex: 1, fontSize: 12, color: colors.textSecondary },
  contrastBadge: {
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  contrastOk: { color: colors.success, backgroundColor: colors.successSoft },
  contrastWarn: { color: colors.warning, backgroundColor: colors.warningSoft },
  contrastNote: { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginTop: 6 },

  // Actions
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 26,
    minHeight: 50,
    justifyContent: "center",
  },
  saveBtnText: { color: colors.primaryText, fontWeight: "800", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  resetBtn: { paddingVertical: 14, alignItems: "center", marginTop: 6, minHeight: 44, justifyContent: "center" },
  resetBtnText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
}));
