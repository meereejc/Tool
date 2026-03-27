import { startTransition, useEffect, useRef, useState } from "react";

import EnvBadge from "../components/EnvBadge";
import EnvHintPanel from "../components/EnvHintPanel";
import ParamInput from "../components/ParamInput";
import TerminalView from "../components/TerminalView";
import {
  checkScriptEnv,
  runScript,
  saveScriptMeta,
  stopScript,
  subscribeToExecutionEvents,
  suggestEnvSetupCommands,
} from "../lib/tauri";
import type {
  EnvCheckResult,
  EnvSetupCommand,
  ExecutionExitEvent,
  ExecutionLogEvent,
  ParamValue,
  ParamValueMap,
  RunScriptData,
  RunScriptInput,
  SaveScriptMetaInput,
  ScriptAsset,
} from "../types/script";

export interface ScriptDetailPageDeps {
  checkScriptEnv: (scriptPath: string) => Promise<EnvCheckResult>;
  suggestEnvSetupCommands: (input: {
    scriptPath: string;
    missingItems: string[];
  }) => Promise<EnvSetupCommand[]>;
  saveScriptMeta: (input: SaveScriptMetaInput) => Promise<{ saved: boolean } | null>;
  runScript: (input: RunScriptInput) => Promise<RunScriptData>;
  stopScript: (executionId: string) => Promise<{ stopped: boolean } | null>;
  subscribeToExecutionEvents: (handlers: {
    onLog: (event: ExecutionLogEvent) => void;
    onExit: (event: ExecutionExitEvent) => void;
  }) => Promise<() => void>;
}

const defaultDeps: ScriptDetailPageDeps = {
  checkScriptEnv,
  suggestEnvSetupCommands,
  saveScriptMeta,
  runScript,
  stopScript,
  subscribeToExecutionEvents,
};

interface CachedEnvState {
  envStatus: EnvCheckResult | null;
  envSuggestions: EnvSetupCommand[];
  envError: string | null;
}

const scriptEnvStateCache = new Map<string, CachedEnvState>();

function readCachedEnvState(scriptPath: string): CachedEnvState | null {
  return scriptEnvStateCache.get(scriptPath) ?? null;
}

function writeCachedEnvState(scriptPath: string, value: CachedEnvState) {
  scriptEnvStateCache.set(scriptPath, value);
}

export function __resetScriptDetailEnvCacheForTests() {
  scriptEnvStateCache.clear();
}

function buildInitialParamValues(script: ScriptAsset): ParamValueMap {
  const values: ParamValueMap = {};

  for (const param of script.meta?.params ?? []) {
    if (param.defaultValue == null) {
      continue;
    }

    const lowerType = param.valueType.toLowerCase();
    if (lowerType === "int" || lowerType === "number") {
      values[param.name] = Number(param.defaultValue);
      continue;
    }

    if (lowerType === "bool" || lowerType === "boolean") {
      values[param.name] = param.defaultValue.toLowerCase() === "true";
      continue;
    }

    values[param.name] = param.defaultValue;
  }

  return values;
}

function isParamMissing(value: ParamValue | undefined): boolean {
  return value == null || value === "";
}

function normalizeParamValues(values: ParamValueMap): ParamValueMap {
  const normalized: ParamValueMap = {};

  for (const [key, value] of Object.entries(values)) {
    if (value === "") {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

interface PendingMetaDraft {
  name: string;
  desc: string;
  category: string;
  platform: string;
  runtime: string;
  dependencies: string;
}

function buildInitialPendingMetaDraft(script: ScriptAsset): PendingMetaDraft {
  return {
    name: script.meta?.name ?? "",
    desc: script.meta?.desc ?? "",
    category: script.meta?.category ?? "",
    platform: script.meta?.platform ?? "",
    runtime: script.meta?.runtime ?? "",
    dependencies: script.meta?.deps.join(", ") ?? "",
  };
}

function normalizeOptionalField(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeDependencyList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface ScriptDetailPageProps {
  script: ScriptAsset;
  defaultCwd?: string;
  compact?: boolean;
  deps?: ScriptDetailPageDeps;
  onMetaSaved?: () => void | Promise<void>;
}

export default function ScriptDetailPage({
  script,
  defaultCwd,
  compact = false,
  deps = defaultDeps,
  onMetaSaved,
}: ScriptDetailPageProps) {
  const initialCachedEnvState = readCachedEnvState(script.filePath);
  const hasMountedRef = useRef(false);
  const [paramValues, setParamValues] = useState<ParamValueMap>(() =>
    buildInitialParamValues(script),
  );
  const [pendingMetaDraft, setPendingMetaDraft] = useState<PendingMetaDraft>(() =>
    buildInitialPendingMetaDraft(script),
  );
  const [envStatus, setEnvStatus] = useState<EnvCheckResult | null>(
    () => initialCachedEnvState?.envStatus ?? null,
  );
  const [envLoading, setEnvLoading] = useState(() => initialCachedEnvState == null);
  const [envSuggestions, setEnvSuggestions] = useState<EnvSetupCommand[]>(
    () => initialCachedEnvState?.envSuggestions ?? [],
  );
  const [envError, setEnvError] = useState<string | null>(
    () => initialCachedEnvState?.envError ?? null,
  );
  const [runError, setRunError] = useState<string | null>(null);
  const [metaSaveError, setMetaSaveError] = useState<string | null>(null);
  const [metaSaveSuccess, setMetaSaveSuccess] = useState<string | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [logs, setLogs] = useState<ExecutionLogEvent[]>([]);
  const [exitEvent, setExitEvent] = useState<ExecutionExitEvent | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const cachedEnvState = readCachedEnvState(script.filePath);

    setParamValues(buildInitialParamValues(script));
    setPendingMetaDraft(buildInitialPendingMetaDraft(script));
    setEnvStatus(cachedEnvState?.envStatus ?? null);
    setEnvLoading(cachedEnvState == null);
    setEnvSuggestions(cachedEnvState?.envSuggestions ?? []);
    setEnvError(cachedEnvState?.envError ?? null);
    setRunError(null);
    setMetaSaveError(null);
    setMetaSaveSuccess(null);
    setSavingMeta(false);
    setLogs([]);
    setExitEvent(null);
    setExecutionId(null);
    setRunning(false);
  }, [script]);

  useEffect(() => {
    const cachedEnvState = readCachedEnvState(script.filePath);
    if (cachedEnvState) {
      return;
    }

    let cancelled = false;

    const loadEnvironment = async () => {
      setEnvLoading(true);
      setEnvError(null);

      try {
        const result = await deps.checkScriptEnv(script.filePath);
        if (cancelled) {
          return;
        }

        const suggestions =
          !result.ok && result.missingItems.length > 0
            ? await deps.suggestEnvSetupCommands({
                scriptPath: script.filePath,
                missingItems: result.missingItems,
              })
            : [];

        if (cancelled) {
          return;
        }

        writeCachedEnvState(script.filePath, {
          envStatus: result,
          envSuggestions: suggestions,
          envError: null,
        });
        setEnvStatus(result);
        setEnvSuggestions(suggestions);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to check the script environment.";

        writeCachedEnvState(script.filePath, {
          envStatus: null,
          envSuggestions: [],
          envError: message,
        });

        if (!cancelled) {
          setEnvError(message);
          setEnvSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setEnvLoading(false);
        }
      }
    };

    void loadEnvironment();

    return () => {
      cancelled = true;
    };
  }, [deps, script]);

  useEffect(() => {
    if (!executionId) {
      return;
    }

    let closed = false;
    let unsubscribe = () => {};

    void deps
      .subscribeToExecutionEvents({
        onLog: (event) => {
          if (closed || event.executionId !== executionId) {
            return;
          }

          startTransition(() => {
            setLogs((current) => [...current, event]);
          });
        },
        onExit: (event) => {
          if (closed || event.executionId !== executionId) {
            return;
          }

          setExitEvent(event);
          setRunning(false);
          setExecutionId(null);
        },
      })
      .then((unlisten) => {
        if (closed) {
          unlisten();
          return;
        }

        unsubscribe = unlisten;
      });

    return () => {
      closed = true;
      unsubscribe();
    };
  }, [deps, executionId]);

  const title = script.meta?.name ?? script.fileName;
  const description = script.meta?.desc ?? "No description available.";
  const category = script.meta?.category ?? "Uncategorized";
  const platform = script.meta?.platform ?? "Any";
  const runtime = script.meta?.runtime ?? "Auto-detect";
  const dependencies =
    script.meta?.deps.length && script.meta.deps.length > 0
      ? script.meta.deps.join(", ")
      : "None";
  const params = script.meta?.params ?? [];
  const detailLayoutClassName = `detail-layout${compact ? " detail-layout-compact" : ""}`;
  const detailCardClassName = `detail-card${compact ? " detail-card-compact" : ""}`;

  const handleRun = async () => {
    setRunError(null);
    setExitEvent(null);

    for (const param of params) {
      if (param.required && isParamMissing(paramValues[param.name])) {
        setRunError(`Missing required parameter ${param.name}.`);
        return;
      }
    }

    const latestEnv = await deps.checkScriptEnv(script.filePath);
    setEnvError(null);
    setEnvStatus(latestEnv);

    if (!latestEnv.ok) {
      setRunError(latestEnv.message ?? "Environment check failed.");

      const suggestions =
        latestEnv.missingItems.length > 0
          ? await deps.suggestEnvSetupCommands({
              scriptPath: script.filePath,
              missingItems: latestEnv.missingItems,
            })
          : [];

      writeCachedEnvState(script.filePath, {
        envStatus: latestEnv,
        envSuggestions: suggestions,
        envError: null,
      });
      setEnvSuggestions(suggestions);

      return;
    }

    writeCachedEnvState(script.filePath, {
      envStatus: latestEnv,
      envSuggestions: [],
      envError: null,
    });
    setEnvSuggestions([]);
    setLogs([]);
    const result = await deps.runScript({
      scriptPath: script.filePath,
      args: normalizeParamValues(paramValues),
      cwd: defaultCwd,
    });
    setExecutionId(result.executionId);
    setRunning(result.started);
  };

  const handleStop = async () => {
    if (!executionId) {
      return;
    }

    await deps.stopScript(executionId);
  };

  const handleSaveMeta = async () => {
    const name = pendingMetaDraft.name.trim();
    const desc = pendingMetaDraft.desc.trim();

    if (!name || !desc) {
      setMetaSaveSuccess(null);
      setMetaSaveError("Display name and description are required.");
      return;
    }

    setSavingMeta(true);
    setMetaSaveError(null);
    setMetaSaveSuccess(null);

    try {
      // The first write-back flow stays intentionally small: only the fields
      // needed to move a PendingMeta script into the configured set.
      await deps.saveScriptMeta({
        scriptPath: script.filePath,
        meta: {
          name,
          desc,
          category: normalizeOptionalField(pendingMetaDraft.category),
          platform: normalizeOptionalField(pendingMetaDraft.platform),
          runtime: normalizeOptionalField(pendingMetaDraft.runtime),
          deps: normalizeDependencyList(pendingMetaDraft.dependencies),
          params: [],
        },
      });

      setMetaSaveSuccess("Metadata saved to the script header.");
      await onMetaSaved?.();
    } catch (error) {
      setMetaSaveSuccess(null);
      setMetaSaveError(
        error instanceof Error ? error.message : "Failed to save script metadata.",
      );
    } finally {
      setSavingMeta(false);
    }
  };

  return (
    <div className={detailLayoutClassName}>
      <section className={detailCardClassName}>
        {!compact ? (
          <>
            <p className="eyebrow">Script detail</p>
            <div className="detail-header">
              <div className="detail-heading-copy">
                <h2>{title}</h2>
                <p className="message">{description}</p>
              </div>
              <EnvBadge envStatus={envStatus} loading={envLoading} />
            </div>

            <div className="detail-meta-grid">
              <div>
                <span className="detail-meta-label">Path</span>
                <code>{script.filePath}</code>
              </div>
              <div>
                <span className="detail-meta-label">Language</span>
                <span>{script.language}</span>
              </div>
              <div>
                <span className="detail-meta-label">Status</span>
                <span>{script.status}</span>
              </div>
              <div>
                <span className="detail-meta-label">Working directory</span>
                <span>{defaultCwd ?? "Script directory"}</span>
              </div>
              <div>
                <span className="detail-meta-label">Category</span>
                <span>{category}</span>
              </div>
              <div>
                <span className="detail-meta-label">Platform</span>
                <span>{platform}</span>
              </div>
              <div>
                <span className="detail-meta-label">Runtime</span>
                <span>{runtime}</span>
              </div>
              <div>
                <span className="detail-meta-label">Dependencies</span>
                <span>{dependencies}</span>
              </div>
            </div>
          </>
        ) : null}

        {script.meta?.inputHint || script.meta?.outputHint ? (
          <div className="detail-hint-stack">
            {script.meta?.inputHint ? (
              <p className="io-hint io-hint-input">{script.meta.inputHint}</p>
            ) : null}
            {script.meta?.outputHint ? (
              <p className="io-hint io-hint-output">{script.meta.outputHint}</p>
            ) : null}
          </div>
        ) : null}

        {script.status === "PendingMeta" ? (
          <section className="pending-meta-editor">
            <div className="section-header">
              <h3>Complete metadata</h3>
            </div>
            <p className="message">
              Add a minimal <code>@sm</code> header so this script can move into
              the configured list after the next refresh.
            </p>
            <div className="pending-meta-grid">
              <label className="input-field">
                <span className="detail-meta-label">Display name</span>
                <input
                  type="text"
                  className="text-input"
                  value={pendingMetaDraft.name}
                  onChange={(event) => {
                    setPendingMetaDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="input-field">
                <span className="detail-meta-label">Description</span>
                <textarea
                  className="text-area"
                  rows={3}
                  value={pendingMetaDraft.desc}
                  onChange={(event) => {
                    setPendingMetaDraft((current) => ({
                      ...current,
                      desc: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="input-field">
                <span className="detail-meta-label">Category</span>
                <input
                  type="text"
                  className="text-input"
                  value={pendingMetaDraft.category}
                  onChange={(event) => {
                    setPendingMetaDraft((current) => ({
                      ...current,
                      category: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="input-field">
                <span className="detail-meta-label">Platform</span>
                <input
                  type="text"
                  className="text-input"
                  value={pendingMetaDraft.platform}
                  onChange={(event) => {
                    setPendingMetaDraft((current) => ({
                      ...current,
                      platform: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="input-field">
                <span className="detail-meta-label">Runtime</span>
                <input
                  type="text"
                  className="text-input"
                  value={pendingMetaDraft.runtime}
                  onChange={(event) => {
                    setPendingMetaDraft((current) => ({
                      ...current,
                      runtime: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="input-field">
                <span className="detail-meta-label">Dependencies</span>
                <input
                  type="text"
                  className="text-input"
                  value={pendingMetaDraft.dependencies}
                  onChange={(event) => {
                    setPendingMetaDraft((current) => ({
                      ...current,
                      dependencies: event.target.value,
                    }));
                  }}
                />
              </label>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="button button-secondary"
                disabled={savingMeta}
                onClick={() => {
                  void handleSaveMeta();
                }}
              >
                {savingMeta ? "Saving..." : "Save metadata"}
              </button>
            </div>
          </section>
        ) : null}

        {params.length > 0 ? (
          <section className="param-grid">
            <div className="section-header">
              <h3>Parameters</h3>
            </div>
            {params.map((param) => (
              <ParamInput
                key={param.name}
                param={param}
                value={paramValues[param.name]}
                onChange={(value) => {
                  setParamValues((current) => ({
                    ...current,
                    [param.name]: value,
                  }));
                }}
              />
            ))}
          </section>
        ) : null}

        <div className="detail-status-stack">
          {envStatus?.message ? <p className="message">{envStatus.message}</p> : null}
          {envError ? <p className="message message-error">{envError}</p> : null}
          {runError ? <p className="message message-error">{runError}</p> : null}
          {metaSaveError ? <p className="message message-error">{metaSaveError}</p> : null}
          {metaSaveSuccess ? <p className="message">{metaSaveSuccess}</p> : null}
        </div>

        <div className="action-row detail-actions">
          <button
            type="button"
            className="button"
            disabled={running}
            onClick={() => {
              void handleRun();
            }}
          >
            {running ? "Running..." : "Run script"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!running}
            onClick={() => {
              void handleStop();
            }}
          >
            Stop
          </button>
        </div>
      </section>

      <EnvHintPanel commands={envSuggestions} />
      <TerminalView logs={logs} exitEvent={exitEvent} />
    </div>
  );
}
