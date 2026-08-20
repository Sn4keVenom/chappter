// src/pages/settings/ModulesPage.tsx
//
// Chapter-wide feature toggles. Turning a module off removes its navigation
// item, its admin sections, and its dashboard cards for everyone — the nav
// model reads the same store, so nothing has to be updated in two places.

import { useEffect, useState } from "react";

import { useModulesStore } from "../../store/useModulesStore";
import { usePermissions } from "../../hooks/usePermissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Switch } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";

export default function ModulesPage() {
  const { isSuperAdmin } = usePermissions();
  const modules = useModulesStore((s) => s.modules);
  const loaded = useModulesStore((s) => s.loaded);
  const fetchModules = useModulesStore((s) => s.fetchModules);
  const setModuleEnabled = useModulesStore((s) => s.setModuleEnabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  if (!isSuperAdmin) {
    return <RequireAccess message="Modules are managed by a Super Admin." />;
  }

  if (!loaded && modules.length === 0) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Modules"
        subtitle="Turn whole sections of ChapterHub on or off for the entire chapter."
        backTo="/settings"
        backLabel="Settings"
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        {modules.map((module) => (
          <div
            key={module.key}
            style={{ borderBottom: "1px solid var(--color-divider)", paddingBottom: "var(--space-2)", marginBottom: "var(--space-2)" }}
          >
            <Switch
              checked={module.enabled}
              disabled={module.comingSoon}
              onChange={async (next) => {
                setError(null);
                try {
                  await setModuleEnabled(module.key, next);
                } catch (e: any) {
                  setError(e?.message ?? "Couldn't update the module.");
                }
              }}
              label={module.label}
              hint={module.description ?? undefined}
            />
            {module.comingSoon ? <Badge tone="warning">Coming soon</Badge> : null}
          </div>
        ))}
      </Card>
    </div>
  );
}
