// src/pages/settings/PermissionsPage.tsx
//
// "Roles are permission presets." A Super Admin picks a role and toggles
// exactly what it can do; the same engine that answers these checks in the UI
// is the one the API enforces with, so the two can't drift.
//
// SUPER_ADMIN is deliberately not editable — a role that can edit its own
// permissions can lock every administrator out of the chapter.

import { useEffect, useState } from "react";

import { usePermissionsStore } from "../../store/usePermissionsStore";
import { usePermissions } from "../../hooks/usePermissions";
import {
  EDITABLE_PRESET_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from "../../permissions/permissions";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { SegmentedControl, Switch } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import type { Permission, UserRole } from "../../types";

export default function PermissionsPage() {
  const { isSuperAdmin } = usePermissions();
  const presets = usePermissionsStore((s) => s.presets);
  const loaded = usePermissionsStore((s) => s.loaded);
  const fetchPermissions = usePermissionsStore((s) => s.fetchPermissions);
  const updateRolePermissions = usePermissionsStore((s) => s.updateRolePermissions);

  const [role, setRole] = useState<UserRole>(EDITABLE_PRESET_ROLES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  if (!isSuperAdmin) {
    return <RequireAccess message="Permissions are managed by a Super Admin." />;
  }

  if (!loaded) return <LoadingState />;

  const granted = new Set(presets[role] ?? []);

  async function toggle(permission: Permission, next: boolean) {
    setBusy(true);
    setError(null);
    const updated = new Set(granted);
    if (next) updated.add(permission);
    else updated.delete(permission);
    try {
      await updateRolePermissions(role, [...updated]);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't update permissions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Permissions"
        subtitle="What each role can do. Super Admin always has everything and can't be edited."
        backTo="/settings"
        backLabel="Settings"
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div style={{ marginBottom: "var(--space-6)" }}>
        <SegmentedControl
          label="Role"
          options={EDITABLE_PRESET_ROLES.map((value) => ({
            value,
            label: value.charAt(0) + value.slice(1).toLowerCase(),
          }))}
          value={role}
          onChange={(next) => setRole(next as UserRole)}
          block
        />
      </div>

      {PERMISSION_GROUPS.map((group) => (
        <Section key={group.label} title={group.label}>
          <Card>
            {group.permissions.map((permission) => (
              <Switch
                key={permission}
                checked={granted.has(permission)}
                disabled={busy}
                onChange={(next) => toggle(permission, next)}
                label={PERMISSION_LABELS[permission] ?? permission}
                hint={permission}
              />
            ))}
          </Card>
        </Section>
      ))}
    </div>
  );
}
