// src/pages/settings/SettingsHomePage.tsx
//
// Settings overview. Carries the chapter identity card (which doubles as a
// live branding preview), the section list that serves as mobile navigation,
// account shortcuts, and sign-out.

import { Link } from "react-router-dom";

import { getChapterSettings } from "../../api/settings";
import { useAsync } from "../../hooks/useAsync";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ErrorBanner } from "../../components/ui/Feedback";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { useVisibleSettingsSections } from "../../layouts/SettingsLayout";
import { useThemeStore } from "../../theme/useThemeStore";
import { useModulesStore } from "../../store/useModulesStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useAppAuth } from "../../auth/useAppAuth";
import { DEMO_MODE } from "../../config/demo";
import { DEMO_DEFAULT_USER_ID } from "../../mocks/identity";
import { switchDemoUser } from "../../mocks/bootstrap";
import { useState } from "react";
import styles from "./SettingsHomePage.module.css";

const APP_VERSION = "2.0.0";

const MODE_LABEL: Record<string, string> = {
  system: "Match device",
  light: "Light",
  dark: "Dark",
};

function Row({
  to,
  icon,
  label,
  description,
  value,
}: {
  to: string;
  icon: string;
  label: string;
  description?: string;
  value?: string;
}) {
  return (
    <Link to={to} className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowLabel}>{label}</span>
        {description ? <span className={styles.rowDescription}>{description}</span> : null}
      </span>
      {value ? <span className={styles.rowValue}>{value}</span> : null}
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

export default function SettingsHomePage() {
  const branding = useThemeStore((s) => s.branding);
  const mode = useThemeStore((s) => s.mode);
  const sections = useVisibleSettingsSections();
  const user = useAuthStore((s) => s.user);
  const { signOut } = useAppAuth();
  const isDocumentsEnabled = useModulesStore((s) => s.isEnabled("documents"));
  const isFeedbackEnabled = useModulesStore((s) => s.isEnabled("feedback"));

  const [signOutOpen, setSignOutOpen] = useState(false);

  const { data: settings, error, reload } = useAsync(() => getChapterSettings(), []);

  async function handleSignOut() {
    if (DEMO_MODE) {
      switchDemoUser(DEMO_DEFAULT_USER_ID);
      setSignOutOpen(false);
      return;
    }
    await signOut();
  }

  return (
    <div>
      <PageHeader title="Settings" />

      {error ? <ErrorBanner message={error} onRetry={() => reload()} /> : null}

      <Card className={styles.chapterCard}>
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="" className={styles.mark} width={56} height={56} />
        ) : (
          <span className={styles.mark} aria-hidden="true">
            {branding.logoEmoji || branding.chapterLetters || "ΘΤ"}
          </span>
        )}
        <div className={styles.chapterBody}>
          <p className={styles.chapterName}>{branding.chapterName}</p>
          {settings?.university ? <p className={styles.chapterMeta}>{settings.university}</p> : null}
          <div className={styles.swatchRow}>
            <span className={styles.swatch} style={{ background: "var(--color-primary)" }} />
            <span className={styles.swatch} style={{ background: "var(--color-accent)" }} />
            <span className={styles.swatchLabel}>Chapter colors</span>
          </div>
        </div>
      </Card>

      <div className={styles.sectionList}>
        <Section title="Configuration">
          <div className={styles.list}>
            {sections.map((section) => (
              <Row
                key={section.to}
                to={section.to}
                icon={section.icon}
                label={section.label}
                description={section.description}
                value={section.to === "/settings/appearance" ? MODE_LABEL[mode] : undefined}
              />
            ))}
          </div>
        </Section>
      </div>

      <Section title="Account">
        <div className={styles.list}>
          <Row
            to="/profile/edit"
            icon="👤"
            label="Edit Profile"
            description="Name, major, graduation year, contact info"
          />
          <Row to="/family" icon="🌳" label="My Family" description="Your Big and Littles" />
          {isDocumentsEnabled ? (
            <Row
              to="/documents"
              icon="📄"
              label="Documents"
              description="Chapter files, forms, and external links"
            />
          ) : null}
          {isFeedbackEnabled ? (
            <Row
              to="/feedback"
              icon="💬"
              label="Send Feedback"
              description="Report a bug or request a feature"
            />
          ) : null}
        </div>
      </Section>

      <Section title="About">
        <Card>
          <p className={styles.about}>
            Chappter {APP_VERSION}
            {DEMO_MODE ? " · Demo Mode" : ""}
            <br />
            {settings?.currentSemesterLabel ? `Current semester: ${settings.currentSemesterLabel}` : null}
          </p>
        </Card>
      </Section>

      <Button variant="secondary" block onClick={() => setSignOutOpen(true)}>
        {DEMO_MODE ? "Reset demo session" : `Sign out${user?.username ? ` (@${user.username})` : ""}`}
      </Button>

      <ConfirmDialog
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={handleSignOut}
        title={DEMO_MODE ? "Reset demo session?" : "Sign out?"}
        body={
          DEMO_MODE
            ? "There's no real account to sign out of — this is a local demo. This resets to the default demo user."
            : "You'll need to sign back in to access Chappter."
        }
        confirmLabel={DEMO_MODE ? "Reset" : "Sign out"}
        destructive={!DEMO_MODE}
      />
    </div>
  );
}
