// src/components/ui/Card.tsx
//
// The app's primary content container. `as` decides the element: a plain
// <section> for static content, a <button> or <Link> when the whole card is
// the click target — which keeps a tappable card keyboard-reachable instead
// of being a div with an onClick.

import { Link, type LinkProps } from "react-router-dom";
import styles from "./Card.module.css";

interface BaseProps {
  /** Colored left edge, used for event category and dues status. */
  accentColor?: string;
  padless?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function cardClass(
  { accentColor, padless, className }: BaseProps,
  interactive: boolean
): string {
  return [
    styles.card,
    padless ? styles.padless : "",
    accentColor ? styles.accentEdge : "",
    interactive ? styles.interactive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Card({
  as: As = "section",
  accentColor,
  padless,
  className,
  style,
  children,
  ...rest
}: BaseProps & {
  as?: "section" | "article" | "div" | "li";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cardClass({ accentColor, padless, className }, false)}
      style={accentColor ? { borderLeftColor: accentColor, ...style } : style}
      {...rest}
    >
      {children}
    </As>
  );
}

export function CardLink({
  accentColor,
  padless,
  className,
  style,
  children,
  ...rest
}: BaseProps & Omit<LinkProps, "className" | "style">) {
  return (
    <Link
      className={cardClass({ accentColor, padless, className }, true)}
      style={accentColor ? { borderLeftColor: accentColor, ...style } : style}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function CardButton({
  accentColor,
  padless,
  className,
  style,
  children,
  ...rest
}: BaseProps & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style">) {
  return (
    <button
      type="button"
      className={cardClass({ accentColor, padless, className }, true)}
      style={accentColor ? { borderLeftColor: accentColor, ...style } : style}
      {...rest}
    >
      {children}
    </button>
  );
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className={styles.header}>{children}</div>;
}

export function CardTitle({ children, as: As = "h2" }: { children: React.ReactNode; as?: "h2" | "h3" | "h4" }) {
  return <As className={styles.title}>{children}</As>;
}

/** Small uppercase eyebrow above a card's value — "POINTS", "DUES", etc. */
export function CardLabel({ children }: { children: React.ReactNode }) {
  return <p className={styles.label}>{children}</p>;
}
