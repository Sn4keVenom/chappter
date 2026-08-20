// src/layouts/AppLayout.tsx
//
// The signed-in shell. Two deliberately separate designs rather than one that
// collapses:
//
//   mobile (< 900px)  sticky top bar with the chapter mark and an avatar
//                     button, a fixed bottom navigation bar for the primary
//                     destinations, and a right-hand drawer for everything
//                     else. One-handed: the bar is at the bottom, the drawer
//                     opens from the side the thumb is already on.
//
//   desktop (>= 900px) persistent left sidebar carrying the full navigation
//                     grouped into sections, with the user card pinned at the
//                     bottom. No bottom bar, no top bar — the extra vertical
//                     space goes to content.
//
// Both render from navModel.ts, so role and module visibility can't diverge
// between them.

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuthStore } from "../store/useAuthStore";
import { useModulesStore } from "../store/useModulesStore";
import { usePermissions } from "../hooks/usePermissions";
import { useThemeStore } from "../theme/useThemeStore";
import { mobileBarItems, navSections, type NavContext, type NavItem } from "../navigation/navModel";
import { DEMO_MODE } from "../config/demo";
import { DemoRoleSwitcher } from "../components/DemoRoleSwitcher";
import styles from "./AppLayout.module.css";

function initials(first?: string, last?: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function NavLinkRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={!item.matchPrefix}
      onClick={onNavigate}
      className={({ isActive }) =>
        [styles.link, isActive ? styles.linkActive : ""].filter(Boolean).join(" ")
      }
    >
      <span className={styles.linkIcon} aria-hidden="true">
        {item.icon}
      </span>
      <span>{item.label}</span>
    </NavLink>
  );
}

function UserCard({ onClick }: { onClick?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const content = (
    <>
      <span className={styles.userAvatar} aria-hidden="true">
        {initials(user?.firstName, user?.lastName)}
      </span>
      <span className={styles.userInfo}>
        <span className={styles.userName}>
          {user?.firstName} {user?.lastName}
        </span>
        <span className={styles.userRole}>{user?.role ?? "—"}</span>
      </span>
    </>
  );

  return onClick ? (
    <button type="button" className={styles.userCard} onClick={onClick}>
      {content}
    </button>
  ) : (
    <Link to="/profile" className={styles.userCard}>
      {content}
    </Link>
  );
}

export default function AppLayout() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);

  const branding = useThemeStore((s) => s.branding);
  const user = useAuthStore((s) => s.user);
  const { can, canViewAdminPanel, isSuperAdmin, isExecOrAbove, isTreasurerOrAdmin } = usePermissions();
  const isModuleEnabled = useModulesStore((s) => s.isEnabled);

  const ctx: NavContext = {
    can,
    isModuleEnabled,
    canViewAdminPanel,
    isSuperAdmin,
    isExecOrAbove,
    isTreasurerOrAdmin,
  };
  const sections = navSections(ctx);
  const barItems = mobileBarItems(ctx);

  // Close the drawer on navigation — otherwise tapping a link leaves it open
  // over the page it just navigated to.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Escape closes it, and focus returns to the button that opened it.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      drawerTriggerRef.current?.focus();
    };
  }, [drawerOpen]);

  const mark = branding.logoEmoji || branding.chapterLetters || "ΘΤ";

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      {/* ── Desktop sidebar ── */}
      <aside className={styles.sidebar} aria-label="Main navigation">
        <Link to="/" className={styles.sidebarBrand}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className={styles.sidebarMark} width={38} height={38} />
          ) : (
            <span className={styles.sidebarMark} aria-hidden="true">
              {mark}
            </span>
          )}
          <span className={styles.sidebarName}>{branding.chapterName}</span>
        </Link>

        <nav className={styles.sidebarNav}>
          {sections.map((section) => (
            <div key={section.id}>
              {section.title ? <p className={styles.sectionTitle}>{section.title}</p> : null}
              {section.items.map((item) => (
                <NavLinkRow key={item.to} item={item} />
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          {DEMO_MODE ? <DemoRoleSwitcher /> : null}
          <UserCard />
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <header className={styles.topbar}>
        <Link to="/" className={styles.brand}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className={styles.brandMark} width={30} height={30} />
          ) : (
            <span className={styles.brandMark} aria-hidden="true">
              {mark}
            </span>
          )}
          <span className={styles.brandName}>{branding.chapterName}</span>
        </Link>
        <span className={styles.topbarSpacer} />
        <button
          ref={drawerTriggerRef}
          type="button"
          className={styles.topbarButton}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
        >
          <span className={styles.avatarButton} aria-hidden="true">
            {initials(user?.firstName, user?.lastName)}
          </span>
        </button>
      </header>

      <main className={styles.main} id="main-content">
        <Outlet />
      </main>

      {/* ── Mobile bottom bar ── */}
      <nav className={styles.bottomNav} aria-label="Primary">
        {barItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={!item.matchPrefix}
            className={({ isActive }) =>
              [styles.navItem, isActive ? styles.navItemActive : ""].filter(Boolean).join(" ")
            }
          >
            <span className={styles.navIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.navLabel}>{item.shortLabel ?? item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={styles.navItem}
          onClick={() => setDrawerOpen(true)}
          aria-label="More destinations"
          aria-haspopup="dialog"
        >
          <span className={styles.navIcon} aria-hidden="true">
            ☰
          </span>
          <span className={styles.navLabel}>More</span>
        </button>
      </nav>

      {/* ── Mobile drawer ── */}
      {drawerOpen ? (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} />
          <div
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
          >
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>Menu</span>
              <button
                type="button"
                className={styles.topbarButton}
                style={{ color: "var(--color-text-muted)" }}
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className={styles.drawerNav}>
              {sections.map((section) => (
                <div key={section.id}>
                  {section.title ? <p className={styles.sectionTitle}>{section.title}</p> : null}
                  {section.items.map((item) => (
                    <NavLinkRow key={item.to} item={item} onNavigate={() => setDrawerOpen(false)} />
                  ))}
                </div>
              ))}
            </nav>
            <div className={styles.drawerFooter}>
              {DEMO_MODE ? <DemoRoleSwitcher /> : null}
              <UserCard />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
