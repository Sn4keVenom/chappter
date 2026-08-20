// src/layouts/SettingsLayout.tsx
//
// Settings shell. On desktop it renders a persistent sub-navigation next to
// the active section; on mobile the sections are a list on the index route
// and each opens as its own URL.
//
// The important property either way: this layout component sits ABOVE the
// section routes, so navigating between sections re-renders only the
// <Outlet/>. Nothing in the shell remounts, no data it owns is refetched, and
// the browser's Back button returns to the previous section rather than
// re-entering the app.

import { NavLink, Outlet } from "react-router-dom";

import { usePermissions } from "../hooks/usePermissions";
import styles from "./SettingsLayout.module.css";

export interface SettingsSection {
  to: string;
  label: string;
  icon: string;
  description: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

/** Shared with SettingsHomePage so the mobile list and desktop nav agree. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    to: "/settings/appearance",
    label: "Appearance",
    icon: "🎨",
    description: "Light, Dark, or match your device",
  },
  {
    to: "/settings/branding",
    label: "Chapter Branding",
    icon: "⚜️",
    description: "Colors, name, and logo for everyone in the chapter",
    adminOnly: true,
  },
  {
    to: "/settings/chapter",
    label: "Chapter Settings",
    icon: "🏛",
    description: "Semester dates, dues and attendance defaults",
    superAdminOnly: true,
  },
  {
    to: "/settings/modules",
    label: "Modules",
    icon: "🧩",
    description: "Enable or disable entire app sections",
    superAdminOnly: true,
  },
  {
    to: "/settings/permissions",
    label: "Permissions",
    icon: "🔑",
    description: "Edit what each role can do",
    superAdminOnly: true,
  },
];

export function useVisibleSettingsSections(): SettingsSection[] {
  const { can, isSuperAdmin } = usePermissions();
  return SETTINGS_SECTIONS.filter((section) => {
    if (section.superAdminOnly) return isSuperAdmin;
    if (section.adminOnly) return can("settings.manage");
    return true;
  });
}

export default function SettingsLayout() {
  const sections = useVisibleSettingsSections();

  return (
    <div className={styles.wrap}>
      <nav className={styles.nav} aria-label="Settings sections">
        <p className={styles.navTitle}>Settings</p>
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            [styles.navLink, isActive ? styles.navLinkActive : ""].filter(Boolean).join(" ")
          }
        >
          <span className={styles.navIcon} aria-hidden="true">
            ⚙️
          </span>
          Overview
        </NavLink>
        {sections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) =>
              [styles.navLink, isActive ? styles.navLinkActive : ""].filter(Boolean).join(" ")
            }
          >
            <span className={styles.navIcon} aria-hidden="true">
              {section.icon}
            </span>
            {section.label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.panel}>
        <Outlet />
      </div>
    </div>
  );
}
