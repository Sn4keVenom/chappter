// src/store/usePermissionsStore.ts
//
// Holds the CURRENT role→permission map (mutable — a Super Admin can edit
// it at runtime, see screens/admin/PermissionsScreen.tsx). Every permission
// check in the app (usePermissions.ts) reads from here, never from the
// hardcoded defaults in permissions/permissions.ts, so an edit takes effect
// immediately for every screen without a reload.

import { create } from "zustand";
import { getRolePermissions, updateRolePermissions as apiUpdateRolePermissions } from "../api/permissions";
import { defaultRolePermissions } from "../permissions/permissions";
import type { Permission, UserRole } from "../types";

interface PermissionsState {
  presets: Record<UserRole, Permission[]>;
  loaded: boolean;
  fetchPermissions: () => Promise<void>;
  updateRolePermissions: (role: UserRole, permissions: Permission[]) => Promise<void>;
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  // Sensible defaults so hasPermission() works even before the first fetch
  // resolves (e.g. very first paint) — refreshed for real on app boot.
  presets: defaultRolePermissions(),
  loaded: false,
  fetchPermissions: async () => {
    try {
      const list = await getRolePermissions();
      const presets = { ...get().presets };
      for (const rp of list) presets[rp.role] = rp.permissions;
      set({ presets, loaded: true });
    } catch {
      // Keep defaults on failure — non-fatal, same pattern as other stores.
    }
  },
  updateRolePermissions: async (role, permissions) => {
    const updated = await apiUpdateRolePermissions(role, permissions);
    set({ presets: { ...get().presets, [updated.role]: updated.permissions } });
  },
}));
