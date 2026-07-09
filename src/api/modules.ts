// src/api/modules.ts
//
// Module/feature toggles (spec §5). See store/useModulesStore.ts for the
// reactive client-side cache that navigation and admin screens read from.

import { apiClient } from "./client";
import type { ModuleConfig, ModuleKey } from "../types";

export async function getModules(): Promise<ModuleConfig[]> {
  const { data } = await apiClient.get<{ modules: ModuleConfig[] }>("/modules");
  return data.modules;
}

export async function setModuleEnabled(key: ModuleKey, enabled: boolean): Promise<ModuleConfig> {
  const { data } = await apiClient.patch<{ module: ModuleConfig }>(`/modules/${key}`, { enabled });
  return data.module;
}
