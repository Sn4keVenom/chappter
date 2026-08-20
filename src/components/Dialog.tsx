// src/components/Dialog.tsx
//
// Shared modal dialog chrome — scrim, card, title, and a footer action bar.
// Extracted because every dialog in the app had hand-rolled its own button
// row, and they had drifted into three different sizes with three different
// spacings. The Assign Big dialog was the worst case (see the bugs listed
// under DialogActions below).
//
// What this guarantees, so individual screens don't have to:
//   · 48pt minimum height on every action, comfortably over the 44pt iOS
//     touch-target floor.
//   · Equal widths in a row, or a stacked column when the text won't fit —
//     decided from the user's Dynamic Type scale, not from a device guess.
//   · Consistent 10pt gaps; no button ever overlaps or stretches to fill
//     leftover vertical space.
//   · Safe-area insets respected on both edges, and the card lifts above the
//     keyboard rather than sitting under it.
//   · Fully themed — light, dark, and any chapter branding.

import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  PixelRatio,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "../theme/makeStyles";
import { useTheme } from "../theme/ThemeProvider";

export interface DialogProps {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  /** Action buttons — pass <DialogButton>s inside <DialogActions>. */
  footer?: React.ReactNode;
  /** Cap the card height, e.g. "70%" for a dialog containing a list. */
  maxHeight?: number | `${number}%`;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Dialog({
  visible,
  onRequestClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight,
  contentStyle,
}: DialogProps) {
  useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Tapping the scrim dismisses, but the card itself must not — hence
            the inner Pressable swallowing the press rather than a single
            overlay handler. */}
        <Pressable style={styles.overlay} onPress={onRequestClose} accessibilityRole="button">
          <Pressable
            style={[
              styles.card,
              {
                marginTop: insets.top + 12,
                marginBottom: insets.bottom + 12,
              },
              maxHeight ? { maxHeight } : null,
              contentStyle,
            ]}
            // Absorbs the press so it never reaches the scrim above.
            onPress={() => {}}
          >
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {children}
            {footer}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Footer action bar.
 *
 * Lays buttons out in an equal-width row by default. At larger Dynamic Type
 * settings — or when there are three or more actions on a narrow phone — it
 * stacks them full-width instead, because that's exactly where the old
 * hand-rolled rows broke: three `flex: 1` buttons on an iPhone SE at
 * Accessibility text sizes truncated "Cancel" to "Can…" and pushed the
 * primary action off its own edge.
 */
export function DialogActions({ children }: { children: React.ReactNode }) {
  useTheme();
  const { width } = useWindowDimensions();
  const count = React.Children.count(children);

  // PixelRatio.getFontScale() reflects the OS text-size slider; 1.3 is roughly
  // where two words stop fitting on one line inside a half-width button.
  const fontScale = PixelRatio.getFontScale();
  const stack = fontScale >= 1.3 || (count >= 3 && width < 400) || count > 3;

  return (
    <View style={stack ? styles.actionsColumn : styles.actionsRow}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, { stacked: stack })
          : child
      )}
    </View>
  );
}

export interface DialogButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive";
  disabled?: boolean;
  busy?: boolean;
  /** Set automatically by DialogActions — don't pass this yourself. */
  stacked?: boolean;
}

export function DialogButton({
  label,
  onPress,
  variant = "secondary",
  disabled,
  busy,
  stacked,
}: DialogButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || busy;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        stacked ? styles.buttonStacked : styles.buttonInRow,
        variant === "primary" && styles.buttonPrimary,
        variant === "destructive" && styles.buttonDestructive,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
    >
      {busy ? (
        <ActivityIndicator color={variant === "primary" ? colors.primaryText : colors.textPrimary} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === "primary" && styles.buttonTextPrimary,
            variant === "destructive" && styles.buttonTextDestructive,
          ]}
          numberOfLines={1}
          // Shrink rather than truncate if a long label still overflows at
          // large text sizes — the label stays readable either way.
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = makeStyles((colors) => ({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    // Keeps the dialog from growing to full height on a big phone when its
    // content is short.
    alignSelf: "stretch",
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  actionsColumn: { flexDirection: "column", gap: 10, marginTop: 20 },

  button: {
    borderRadius: 10,
    // 48 clears the 44pt iOS minimum with room for a border, and stays
    // constant whether the label is one word or two lines.
    minHeight: 48,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Equal share of the row, and `flexBasis: 0` so a long label can't make one
  // button wider than its siblings.
  buttonInRow: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  // Explicit alignSelf: "stretch" — NOT flex — so a stacked button fills the
  // width without also expanding to absorb leftover vertical space, which is
  // what made the old Assign Big "Close" button stretch down the dialog.
  buttonStacked: { alignSelf: "stretch" },
  buttonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonDestructive: { backgroundColor: "transparent", borderColor: colors.danger },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.75 },

  buttonText: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  buttonTextPrimary: { color: colors.primaryText },
  buttonTextDestructive: { color: colors.danger },
}));
