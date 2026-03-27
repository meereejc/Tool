import { scanDirectories } from "../lib/tauri";
import type { ScanResult, ScriptAsset } from "../types/script";

export type ScanSummaryStatus = "idle" | "scanning" | "ready" | "error";

export interface ScanSummaryState {
  status: ScanSummaryStatus;
  configuredCount: number;
  pendingCount: number;
  configuredScripts: ScriptAsset[];
  pendingScripts: ScriptAsset[];
  error: string | null;
}

export interface ScanSummaryInput {
  paths?: string[];
  looseMode?: boolean;
}

interface ScanSummaryStoreDeps {
  scanDirectories: (input?: ScanSummaryInput) => Promise<ScanResult>;
}

export interface ScanSummaryStore {
  getState: () => ScanSummaryState;
  subscribe: (listener: () => void) => () => void;
  scan: (input?: ScanSummaryInput) => Promise<void>;
}

const defaultDeps: ScanSummaryStoreDeps = {
  scanDirectories: (input) => scanDirectories(input),
};

function createInitialState(): ScanSummaryState {
  return {
    status: "idle",
    configuredCount: 0,
    pendingCount: 0,
    configuredScripts: [],
    pendingScripts: [],
    error: null,
  };
}

export function createScanSummaryStore(
  deps: ScanSummaryStoreDeps = defaultDeps,
): ScanSummaryStore {
  let state = createInitialState();
  const listeners = new Set<() => void>();

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  const setState = (next: Partial<ScanSummaryState>) => {
    state = { ...state, ...next };
    emit();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    async scan(input) {
      setState({
        status: "scanning",
        error: null,
      });

      try {
        const result = await deps.scanDirectories(input);

        setState({
          status: "ready",
          configuredCount: result.configuredScripts.length,
          pendingCount: result.pendingScripts.length,
          configuredScripts: result.configuredScripts,
          pendingScripts: result.pendingScripts,
          error: null,
        });
      } catch (error) {
        setState({
          status: "error",
          error: error instanceof Error ? error.message : "Failed to scan directories.",
        });
      }
    },
  };
}

export const scanSummaryStore = createScanSummaryStore();
