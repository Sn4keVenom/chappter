// src/components/ui/Avatar.tsx
//
// A person's photo, or their initials when there isn't one — the one place
// this decision is made. Before this existed, avatarUrl (self-service upload
// via EditProfilePage.tsx) was persisted correctly but rendered literally
// nowhere: every avatar-shaped spot across the app — the sidebar/topbar user
// card, the Profile hero, a member's own profile page — hardcoded initials
// with no idea the field existed. "The photo doesn't stay across the whole
// site" was that gap, not a second persistence bug.
//
// Deliberately just a `<span>`/`<img>`, not a new visual design: it drops
// into a caller's EXISTING circular sizing class (width/height/background/
// font-size already defined there, e.g. AppLayout.module.css's .userAvatar)
// unchanged — this only decides what goes inside that circle.

import styles from "./Avatar.module.css";

export function initials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export function Avatar({
  avatarUrl,
  firstName,
  lastName,
  className,
  style,
}: {
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** The caller's own circular sizing class — required, not optional, since
   * an Avatar with no size would collapse to nothing. */
  className: string;
  /** For a one-off size override on top of `className` — e.g. a smaller
   * avatar reusing ProfilePage.module.css's `.avatar` in a list row. */
  style?: React.CSSProperties;
}) {
  return (
    <span className={className} style={style} aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className={styles.img} />
      ) : (
        initials(firstName, lastName)
      )}
    </span>
  );
}
