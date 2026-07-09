// src/store/useOfficePermissionsStore.ts
//
// Parallel to usePermissionsStore.ts, for office-scoped grants (e.g. Scribe
// → role numbers — spec §11). Every permission check that also wants
// office-based grants (usePermissions.ts's can()) reads from here, never
// from the hardcoded defaults in permissions/permissions.ts directly, so a
// Super Admin's edit in the office-permissions editor takes effect
// immediately without a reload.

import { create } from "zustand";
import { getOfficePermissions, updateOfficePermissions as apiUpdateOfficePermissions } from "../api/permissions";
import { defaultOfficePermissions } from "../permissions/permissions";
import type { ExecOffice, Permission } from "../types";

interface OfficePermissionsState {
  presets: Partial<Record<ExecOffice, Permission[]>>;
  loaded: boolean;
  error: string | null;
  fetchOfficePermissions: () => Promise<void>;
  updateOfficePermissions: (office: ExecOffice, permissions: Permission[]) => Promise<void>;
}

export const useOfficePermissionsStore = create<OfficePermissionsState>((set, get) => ({
  presets: defaultOfficePermissions(),
  loaded: false,
  error: null,
  fetchOfficePermissions: async () => {
    try {
      const list = await getOfficePermissions();
      const presets = { ...get().presets };
      for (const op of list) presets[op.office] = op.permissions;
      set({ presets, loaded: true, error: null });
    } catch (err: any) {
      set({ error: err?.message ?? "Failed to load office permissions" });
    }
  },
  updateOfficePermissions: async (office, permissions) => {
    const updated = await apiUpdateOfficePermissions(office, permissions);
    set({ presets: { ...get().presets, [updated.office]: updated.permissions } });
  },
}));
