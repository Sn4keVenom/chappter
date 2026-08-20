// src/components/ui/Dialog.tsx
//
// Accessible modal. Presented as a bottom sheet on phones (thumb-reachable,
// clear of browser chrome) and a centered dialog from 600px up — the same
// component, one media query apart.
//
// What it handles so callers don't have to:
//   · role="dialog" aria-modal with a labelled title
//   · Escape to dismiss, backdrop click to dismiss
//   · Focus moved into the dialog on open and restored to the trigger on close
//   · Focus trapped inside while open (Tab and Shift+Tab wrap)
//   · Background scroll locked, so the page behind doesn't move on iOS
//   · Rendered in a portal at <body>, so no ancestor's overflow or transform
//     can clip it

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import styles from "./Dialog.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openDialogCount = 0;

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  /** Action buttons. Rendered in a sticky footer below the scrolling body. */
  footer?: React.ReactNode;
  /** Roomier panel for content like the invite editor. Desktop only. */
  wide?: boolean;
}

export function Dialog({ open, onClose, title, subtitle, children, footer, wide }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`dlg-${Math.random().toString(36).slice(2, 9)}`).current;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Focus trap. Without this, Tab walks out of the dialog into the page
      // behind it, which is invisible to a sighted keyboard user and
      // nonsensical to a screen-reader user.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Lock background scroll. Counted, because a dialog can open on top of
    // another one (the invite editor's confirmation) and the inner one closing
    // must not unlock the page while the outer is still up.
    openDialogCount += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first control, falling back to the panel itself when the
    // dialog is purely informational.
    const focusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (focusable ?? panelRef.current)?.focus();

    return () => {
      openDialogCount -= 1;
      if (openDialogCount === 0) document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      // Dismiss only when the backdrop itself is clicked — a click that starts
      // inside the panel and drifts out (selecting text) must not close it.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        className={[styles.panel, wide ? styles.wide : ""].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <div className={styles.header}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close dialog">
          ✕
        </button>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * Confirmation dialog — the web replacement for the mobile app's Alert.alert
 * prompts. Kept as a component rather than an imperative `confirm()` so it can
 * be styled, themed, focus-trapped, and show a busy state on the action.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={body}
      footer={
        <>
          <Button onClick={onClose} disabled={busy} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            busy={busy}
            variant={destructive ? "dangerSolid" : "primary"}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
