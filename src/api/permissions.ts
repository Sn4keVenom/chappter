// src/api/permissions.ts
//
// Role→permission preset editor (spec §3). Same thin apiClient-wrapper
// pattern as every other api/*.ts file — see store/usePermissionsStore.ts
// for the reactive client-side cache this feeds.

import { apiClient } from "./client";
import type { Permission, RolePermissions, UserRole } from "../types";

export async function getRolePermissions(): Promise<RolePermissions[]> {
  const { data } = await apiClient.get<{ roles: RolePermissions[] }>("/permissions");
  return data.roles;
}

export async function updateRolePermissions(role: UserRole, permissions: Permission[]): Promise<RolePermissions> {
  const { data } = await apiClient.patch<{ role: RolePermissions }>(`/permissions/${role}`, { permissions });
  return data.role;
}
