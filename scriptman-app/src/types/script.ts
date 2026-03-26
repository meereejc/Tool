export type ScriptStatus = "Configured" | "PendingMeta";

export type ScriptLanguage = "python" | "shell" | "node";

export interface ParamDef {
  name: string;
  valueType: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

export interface ScriptMeta {
  name?: string;
  category?: string;
  desc?: string;
  platform?: string;
  runtime?: string;
  deps: string[];
  inputHint?: string;
  outputHint?: string;
  params: ParamDef[];
}

export interface EnvCheckResult {
  ok: boolean;
  permissionOk: boolean;
  runtimeOk: boolean;
  depsOk: boolean;
  missingItems: string[];
  message?: string;
}

export interface EnvSetupCommand {
  title: string;
  command: string;
  requiresPrivilege?: boolean;
  note?: string;
}

export type ParamValue = string | number | boolean;
export type ParamValueMap = Record<string, ParamValue>;

export interface ScriptAsset {
  id: string;
  filePath: string;
  fileName: string;
  language: ScriptLanguage;
  status: ScriptStatus;
  meta?: ScriptMeta;
  envStatus?: EnvCheckResult;
}

export interface ScanResult {
  configuredScripts: ScriptAsset[];
  pendingScripts: ScriptAsset[];
  ignoredCount: number;
  errors: string[];
}

export interface RunScriptInput {
  scriptPath: string;
  args?: ParamValueMap;
  cwd?: string;
}

export interface SaveScriptMetaInput {
  scriptPath: string;
  meta: ScriptMeta;
}

export interface RunScriptData {
  executionId: string;
  started: boolean;
}

export interface ExecutionLogEvent {
  executionId: string;
  stream: "stdout" | "stderr";
  line: string;
}

export interface ExecutionExitEvent {
  executionId: string;
  exitCode: number | null;
  success: boolean;
}
