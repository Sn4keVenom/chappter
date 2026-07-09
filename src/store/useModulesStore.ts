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
  error: string | null;
  fetchModules: () => Promise<void>;
  setModuleEnabled: (key: ModuleKey, enabled: boolean) => Promise<void>;
  isEnabled: (key: ModuleKey) => boolean;
}

export const useModulesStore = create<ModulesState>((set, get) => ({
  modules: [],
  loaded: false,
  error: null,
  fetchModules: async () => {
    try {
      const modules = await getModules();
      set({ modules, loaded: true, error: null });
    } catch (err: any) {
      // Non-fatal for the rest of the app — isEnabled() defaults to true
      // (below) until loaded so nothing wrongly disappears before the first
      // fetch resolves. `error` is surfaced so ModulesScreen isn't stuck on
      // an infinite spinner (it gates on `loaded`, which never flips true
      // on persistent failure) — it can show a retry affordance instead.
      set({ error: err?.message ?? "Failed to load modules" });
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
