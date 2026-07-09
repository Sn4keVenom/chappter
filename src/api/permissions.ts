// src/api/permissions.ts
//
// Role→permission preset editor (spec §3). Same thin apiClient-wrapper
// pattern as every other api/*.ts file — see store/usePermissionsStore.ts
// for the reactive client-side cache this feeds.

import { apiClient } from "./client";
import type { ExecOffice, OfficePermissions, Permission, RolePermissions, UserRole } from "../types";

export async function getRolePermissions(): Promise<RolePermissions[]> {
  const { data } = await apiClient.get<{ roles: RolePermissions[] }>("/permissions");
  return data.roles;
}

export async function updateRolePermissions(role: UserRole, permissions: Permission[]): Promise<RolePermissions> {
  const { data } = await apiClient.patch<{ role: RolePermissions }>(`/permissions/${role}`, { permissions });
  return data.role;
}

export async function getOfficePermissions(): Promise<OfficePermissions[]> {
  const { data } = await apiClient.get<{ offices: OfficePermissions[] }>("/permissions/offices");
  return data.offices;
}

export async function updateOfficePermissions(office: ExecOffice, permissions: Permission[]): Promise<OfficePermissions> {
  const { data } = await apiClient.patch<{ office: OfficePermissions }>(`/permissions/offices/${office}`, { permissions });
  return data.office;
}
