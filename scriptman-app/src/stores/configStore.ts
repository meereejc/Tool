import { loadConfig, saveConfig, selectDirectories } from "../lib/tauri";
import {
  createDefaultConfig,
  needsOnboarding,
  type AppConfig,
} from "../types/config";

export interface ConfigStoreState {
  config: AppConfig;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  needsOnboarding: boolean;
  error: string | null;
}

interface ConfigStoreDeps {
  loadConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<{ saved: boolean } | null>;
  selectDirectories: (multiple?: boolean) => Promise<{ paths: string[] } | null>;
}

export interface ConfigStore {
  getState: () => ConfigStoreState;
  subscribe: (listener: () => void) => () => void;
  load: () => Promise<void>;
  save: (config: AppConfig) => Promise<void>;
  pickDirectories: (multiple?: boolean) => Promise<string[]>;
  addWatchPaths: (paths: string[]) => void;
  removeWatchPath: (path: string) => void;
  clearError: () => void;
}

const defaultDeps: ConfigStoreDeps = {
  loadConfig,
  saveConfig,
  selectDirectories,
};

function createInitialState(): ConfigStoreState {
  const config = createDefaultConfig();

  return {
    config,
    loaded: false,
    loading: false,
    saving: false,
    needsOnboarding: needsOnboarding(config),
    error: null,
  };
}

export function createConfigStore(
  deps: ConfigStoreDeps = defaultDeps,
): ConfigStore {
  let state = createInitialState();
  const listeners = new Set<() => void>();

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  const setState = (next: Partial<ConfigStoreState>) => {
    state = { ...state, ...next };
    emit();
  };

  const syncConfig = (config: AppConfig) => {
    setState({
      config,
      needsOnboarding: needsOnboarding(config),
    });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    async load() {
      setState({
        loading: true,
        error: null,
      });

      try {
        const config = await deps.loadConfig();

        setState({
          config,
          loaded: true,
          loading: false,
          needsOnboarding: needsOnboarding(config),
        });
      } catch (error) {
        const config = createDefaultConfig();
        setState({
          config,
          loaded: true,
          loading: false,
          needsOnboarding: true,
          error: error instanceof Error ? error.message : "Failed to load config.",
        });
      }
    },
    async save(config) {
      setState({
        saving: true,
        error: null,
      });

      try {
        await deps.saveConfig(config);
        setState({
          saving: false,
          config,
          needsOnboarding: needsOnboarding(config),
        });
      } catch (error) {
        setState({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to save config.",
        });
      }
    },
    async pickDirectories(multiple = true) {
      try {
        const result = await deps.selectDirectories(multiple);
        return result?.paths ?? [];
      } catch (error) {
        setState({
          error:
            error instanceof Error
              ? error.message
              : "Failed to select directories.",
        });
        return [];
      }
    },
    addWatchPaths(paths) {
      const merged = [...state.config.watchPaths];

      for (const path of paths) {
        if (!merged.includes(path)) {
          merged.push(path);
        }
      }

      syncConfig({
        ...state.config,
        watchPaths: merged,
      });
    },
    removeWatchPath(path) {
      syncConfig({
        ...state.config,
        watchPaths: state.config.watchPaths.filter((item) => item !== path),
      });
    },
    clearError() {
      setState({ error: null });
    },
  };
}

export const configStore = createConfigStore();
