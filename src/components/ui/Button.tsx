// src/components/ui/Button.tsx
//
// The single interactive control for actions. Renders a real <button> (or an
// <a>/<Link> when it navigates), never a clickable <div> — so keyboard
// activation, focus order, and assistive-technology roles all come for free.

import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid";
export type ButtonSize = "sm" | "md" | "lg";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width — the default for primary actions on mobile. */
  block?: boolean;
  /** Square control sized for a single glyph. Requires an accessible label. */
  iconOnly?: boolean;
  className?: string;
}

export interface ButtonProps
  extends CommonProps,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** Shows a spinner and blocks interaction without changing the layout. */
  busy?: boolean;
}

function classes({ variant = "secondary", size = "md", block, iconOnly, className }: CommonProps) {
  return [
    styles.button,
    styles[variant],
    size !== "md" ? styles[size] : "",
    block ? styles.block : "",
    iconOnly ? styles.iconOnly : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, iconOnly, className, busy, disabled, children, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      // Buttons inside a <form> default to submit, which silently reloads the
      // page when an onClick handler was intended. Default to "button".
      type={type ?? "button"}
      className={classes({ variant, size, block, iconOnly, className })}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends CommonProps, Omit<LinkProps, "className"> {}

export interface ExternalButtonLinkProps
  extends CommonProps,
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className"> {}

/**
 * For destinations outside the app (Google Calendar, a map, a document URL).
 * A plain <a>, not a router Link — and never a <Button> wrapped in an <a>,
 * which is invalid HTML and gives assistive technology two nested controls.
 */
export function ExternalButtonLink({
  variant,
  size,
  block,
  iconOnly,
  className,
  children,
  target = "_blank",
  rel,
  ...rest
}: ExternalButtonLinkProps) {
  return (
    <a
      className={classes({ variant, size, block, iconOnly, className })}
      target={target}
      // noopener is the security-relevant half (prevents the opened page from
      // reaching back through window.opener); noreferrer follows convention.
      rel={rel ?? (target === "_blank" ? "noreferrer noopener" : undefined)}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Same visual treatment, but it navigates — so it must be an anchor. */
export function ButtonLink({
  variant,
  size,
  block,
  iconOnly,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={classes({ variant, size, block, iconOnly, className })} {...rest}>
      {children}
    </Link>
  );
}
