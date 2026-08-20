// src/components/ErrorBoundary.tsx
//
// Top-level render-error safety net. Without this, any uncaught error
// thrown during render anywhere in the tree (a null-check miss, a bad API
// response shape, a third-party component throwing) unmounts the entire
// app to a blank white screen in production, with no way for the user to
// recover short of force-quitting. React error boundaries can only be
// class components — there is no hook equivalent as of React 19.
//
// Deliberately minimal: no crash-reporting SDK wired in yet (there isn't
// one in this project — see docs/DEMO_MODE.md "Logging & Monitoring" gap).
// The componentDidCatch hook below is the single integration point for
// Sentry/Bugsnag/etc. when one is added — nothing else in the app needs to
// change.

import React from "react";
import { View, Text, Pressable } from "react-native";
// No useTheme() subscription here: this is a class component (error
// boundaries have no hook equivalent), and it renders only after a crash —
// a one-shot fallback screen with nothing to repaint. `styles` still resolves
// against whatever theme was active when the crash happened.
import { colors } from "../theme/colors";
import { makeStyles } from "../theme/makeStyles";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Single integration point for a crash-reporting SDK (Sentry, Bugsnag,
    // Firebase Crashlytics, ...) — swap this console.error for
    // `Sentry.captureException(error, { extra: info })` or equivalent.
    console.error("[ChapterHub] Uncaught render error:", error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.screen}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            ChapterHub ran into an unexpected error. Try again — if it keeps
            happening, restart the app.
          </Text>
          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: colors.background,
  },
  icon: { fontSize: 40, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 10, textAlign: "center" },
  body: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 21, marginBottom: 24 },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
}));
