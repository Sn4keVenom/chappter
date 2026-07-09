// src/store/useModulesStore.ts
//
// Holds the CURRENT module enable/disable state (spec §5). Navigation,
// AdminPanelScreen, and any screen belonging to a toggle-able module read
// isEnabled(key) from here so a Super Admin's toggle takes effect
// immediately across the whole app — tabs disappear, admin sections
// disappear, without a reload.

import { create } from "zustand";
import { getModules, setModuleEnabled as apiSetModuleEnabled } from "../api/modules";
import type { ModuleConfig, ModuleKey } from "../types";

interface ModulesState {
  modules: ModuleConfig[];
  loaded: boolean;
  fetchModules: () => Promise<void>;
  setModuleEnabled: (key: ModuleKey, enabled: boolean) => Promise<void>;
  isEnabled: (key: ModuleKey) => boolean;
}

export const useModulesStore = create<ModulesState>((set, get) => ({
  modules: [],
  loaded: false,
  fetchModules: async () => {
    try {
      const modules = await getModules();
      set({ modules, loaded: true });
    } catch {
      // Non-fatal — isEnabled() defaults to true (below) until loaded so
      // nothing wrongly disappears before the first fetch resolves.
    }
  },
  setModuleEnabled: async (key, enabled) => {
    const updated = await apiSetModuleEnabled(key, enabled);
    set({ modules: get().modules.map((m) => (m.key === key ? updated : m)) });
  },
  isEnabled: (key) => {
    const { modules, loaded } = get();
    if (!loaded) return true;
    const mod = modules.find((m) => m.key === key);
    return mod ? mod.enabled : true;
  },
}));
