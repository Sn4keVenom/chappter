// src/pages/settings/PermissionsPage.tsx
//
// "Roles are permission presets." A Super Admin picks a role and toggles
// exactly what it can do; the same engine that answers these checks in the UI
// is the one the API enforces with, so the two can't drift.
//
// SUPER_ADMIN is deliberately not editable — a role that can edit its own
// permissions can lock every administrator out of the chapter.
//
// Offices (Regent, Vice Regent, Scribe, Treasurer, ...) are a second,
// independent grant on top of role — see permissions/permissions.ts
// DEFAULT_OFFICE_PRESETS and hasPermission()'s office argument. The "By
// office" scope below edits those the same way: pick an office, toggle what
// it grants, PATCH /permissions/offices/:office. Both scopes were already
// fully built end-to-end (backend routes, Zustand store, Demo Mode mock) —
// this page was the only missing piece; office grants previously had no UI
// to reach them at all.

import { useEffect, useState } from "react";

import { usePermissionsStore } from "../../store/usePermissionsStore";
import { useOfficePermissionsStore } from "../../store/useOfficePermissionsStore";
import { usePermissions } from "../../hooks/usePermissions";
import {
  EDITABLE_OFFICES,
  EDITABLE_PRESET_ROLES,
  OFFICE_PERMISSION_GROUPS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from "../../permissions/permissions";
import { titleCaseEnum } from "../../utils/format";
import RequireAccess from "../../components/RequireAccess";
import { PageHeader, Section } from "../../components/PageHeader";
import { Card } from "../../components/ui/Card";
import { SegmentedControl, Select, Switch } from "../../components/ui/Form";
import { ErrorBanner, LoadingState } from "../../components/ui/Feedback";
import type { ExecOffice, Permission, UserRole } from "../../types";

type Scope = "role" | "office";

export default function PermissionsPage() {
  const { isSuperAdmin } = usePermissions();

  const rolePresets = usePermissionsStore((s) => s.presets);
  const rolesLoaded = usePermissionsStore((s) => s.loaded);
  const fetchPermissions = usePermissionsStore((s) => s.fetchPermissions);
  const updateRolePermissions = usePermissionsStore((s) => s.updateRolePermissions);

  const officePresets = useOfficePermissionsStore((s) => s.presets);
  const officesLoaded = useOfficePermissionsStore((s) => s.loaded);
  const fetchOfficePermissions = useOfficePermissionsStore((s) => s.fetchOfficePermissions);
  const updateOfficePermissions = useOfficePermissionsStore((s) => s.updateOfficePermissions);

  const [scope, setScope] = useState<Scope>("role");
  const [role, setRole] = useState<UserRole>(EDITABLE_PRESET_ROLES[0]);
  const [office, setOffice] = useState<ExecOffice>(EDITABLE_OFFICES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPermissions();
    fetchOfficePermissions();
  }, [fetchPermissions, fetchOfficePermissions]);

  if (!isSuperAdmin) {
    return <RequireAccess message="Permissions are managed by a Super Admin." />;
  }

  if (!rolesLoaded || !officesLoaded) return <LoadingState />;

  const granted = new Set(scope === "role" ? rolePresets[role] ?? [] : officePresets[office] ?? []);
  const groups = scope === "role" ? PERMISSION_GROUPS : OFFICE_PERMISSION_GROUPS;

  async function toggle(permission: Permission, next: boolean) {
    setBusy(true);
    setError(null);
    const updated = new Set(granted);
    if (next) updated.add(permission);
    else updated.delete(permission);
    try {
      if (scope === "role") await updateRolePermissions(role, [...updated]);
      else await updateOfficePermissions(office, [...updated]);
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
        subtitle="What each role — or each exec office — can do. Super Admin always has everything and can't be edited."
        backTo="/settings"
        backLabel="Settings"
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div style={{ marginBottom: "var(--space-4)" }}>
        <SegmentedControl
          label="Scope"
          options={[
            { value: "role", label: "By role" },
            { value: "office", label: "By office" },
          ]}
          value={scope}
          onChange={(next) => setScope(next as Scope)}
          block
        />
      </div>

      <div style={{ marginBottom: "var(--space-6)" }}>
        {scope === "role" ? (
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
        ) : (
          <Select label="Office" value={office} onChange={(e) => setOffice(e.target.value as ExecOffice)}>
            {EDITABLE_OFFICES.map((o) => (
              <option key={o} value={o}>
                {titleCaseEnum(o)}
              </option>
            ))}
          </Select>
        )}
      </div>

      {scope === "office" ? (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginBottom: "var(--space-5)" }}>
          Office grants are additive to whatever the holder's role already allows — turning something off here
          doesn't take it away if their role grants it too.
        </p>
      ) : null}

      {groups.map((group) => (
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
