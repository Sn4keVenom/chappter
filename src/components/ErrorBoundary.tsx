// src/components/ErrorBoundary.tsx
//
// Top-level render-error safety net. Without it, any uncaught error thrown
// during render anywhere in the tree unmounts the whole app to a blank page
// with no way to recover short of a manual reload.
//
// React error boundaries must be class components — there is still no hook
// equivalent. Deliberately minimal: componentDidCatch is the single
// integration point for a crash reporter when one is added.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "var(--space-6)",
          textAlign: "center",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ display: "grid", gap: "var(--space-3)", maxWidth: "44ch" }}>
          <span style={{ fontSize: "2.5rem" }} aria-hidden="true">
            ⚠️
          </span>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Something went wrong</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
            Chappter hit an unexpected error and couldn't finish loading this
            page. Reloading usually clears it.
          </p>
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)" }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: "var(--tap)",
              padding: "0 var(--space-5)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-primary)",
              color: "var(--color-on-primary)",
              fontWeight: 700,
              justifySelf: "center",
            }}
          >
            Reload Chappter
          </button>
        </div>
      </div>
    );
  }
}
