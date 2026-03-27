import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
  createDefaultConfig,
  type AppConfig,
} from "../types/config";
import type {
  EnvCheckResult,
  EnvSetupCommand,
  ExecutionExitEvent,
  ExecutionLogEvent,
  RunScriptData,
  RunScriptInput,
  SaveScriptMetaInput,
  ScanResult,
} from "../types/script";
import {
  CommandInvokeError,
  type CommandResult,
} from "../types/command";

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null>;
export async function invokeCommand(
  command: string,
  args?: Record<string, unknown>,
): Promise<null>;
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  const result = await invoke<CommandResult<T>>(command, args ?? {});

  if (!result.success) {
    if (result.error) {
      throw new CommandInvokeError(result.error);
    }

    throw new Error(`Command "${command}" failed without an error payload.`);
  }

  if (result.data == null) {
    return null;
  }

  return result.data;
}

export async function loadConfig(): Promise<AppConfig> {
  return (await invokeCommand<AppConfig>("load_config")) ?? createDefaultConfig();
}

export async function saveConfig(
  config: AppConfig,
): Promise<{ saved: boolean } | null> {
  return invokeCommand<{ saved: boolean }>("save_config", {
    input: { config },
  });
}

export async function selectDirectories(
  multiple = true,
): Promise<{ paths: string[] } | null> {
  return invokeCommand<{ paths: string[] }>("select_directories", {
    input: { multiple },
  });
}

export async function scanDirectories(input?: {
  paths?: string[];
  looseMode?: boolean;
}): Promise<ScanResult> {
  return (
    (await invokeCommand<ScanResult>("scan_directories", { input })) ?? {
      configuredScripts: [],
      pendingScripts: [],
      ignoredCount: 0,
      errors: [],
    }
  );
}

export async function checkScriptEnv(scriptPath: string): Promise<EnvCheckResult> {
  return (
    (await invokeCommand<EnvCheckResult>("check_script_env", {
      input: { scriptPath },
    })) ?? {
      ok: false,
      permissionOk: false,
      runtimeOk: false,
      depsOk: false,
      missingItems: [],
    }
  );
}

export async function suggestEnvSetupCommands(input: {
  scriptPath: string;
  missingItems: string[];
}): Promise<EnvSetupCommand[]> {
  return (
    (await invokeCommand<EnvSetupCommand[]>("suggest_env_setup_commands", {
      input,
    })) ?? []
  );
}

export async function runScript(
  input: RunScriptInput,
): Promise<RunScriptData> {
  return (
    (await invokeCommand<RunScriptData>("run_script", { input })) ?? {
      executionId: "",
      started: false,
    }
  );
}

export async function saveScriptMeta(
  input: SaveScriptMetaInput,
): Promise<{ saved: boolean } | null> {
  return invokeCommand<{ saved: boolean }>("save_script_meta", {
    input,
  });
}

export async function stopScript(
  executionId: string,
): Promise<{ stopped: boolean } | null> {
  return invokeCommand<{ stopped: boolean }>("stop_script", {
    input: { executionId },
  });
}

export async function subscribeToExecutionEvents(handlers: {
  onLog: (event: ExecutionLogEvent) => void;
  onExit: (event: ExecutionExitEvent) => void;
}): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen<ExecutionLogEvent>("scriptman://execution/stdout", (event) => {
      handlers.onLog(event.payload);
    }),
    listen<ExecutionLogEvent>("scriptman://execution/stderr", (event) => {
      handlers.onLog(event.payload);
    }),
    listen<ExecutionExitEvent>("scriptman://execution/exit", (event) => {
      handlers.onExit(event.payload);
    }),
  ]);

  return () => {
    for (const unlisten of unlisteners as UnlistenFn[]) {
      unlisten();
    }
  };
}
