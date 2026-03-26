import {
  useDeferredValue,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import ScriptCard from "../components/ScriptCard";
import {
  scanSummaryStore,
  type ScanSummaryStore,
} from "../stores/scanSummaryStore";
import type { ScriptAsset } from "../types/script";
import ScriptDetailPage, {
  type ScriptDetailPageDeps,
} from "./ScriptDetailPage";

interface DashboardPageProps {
  watchPaths: string[];
  defaultCwd?: string;
  savingWatchPaths?: boolean;
  configError?: string | null;
  onPickDirectories?: () => void | Promise<void>;
  onRemoveWatchPath?: (path: string) => void;
  onSaveWatchPaths?: () => void | Promise<void>;
  scanStore?: ScanSummaryStore;
  detailDeps?: ScriptDetailPageDeps;
}

export default function DashboardPage({
  watchPaths,
  defaultCwd,
  savingWatchPaths = false,
  configError = null,
  onPickDirectories,
  onRemoveWatchPath,
  onSaveWatchPaths,
  scanStore = scanSummaryStore,
  detailDeps,
}: DashboardPageProps) {
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortMode, setSortMode] = useState<"path" | "name" | "language">("path");
  const [watchPathValidationError, setWatchPathValidationError] = useState<
    string | null
  >(null);
  const deferredFilterQuery = useDeferredValue(filterQuery);
  const scanState = useSyncExternalStore(
    scanStore.subscribe,
    scanStore.getState,
    scanStore.getState,
  );
  const normalizedQuery = deferredFilterQuery.trim().toLowerCase();
  const filterScript = (script: ScriptAsset) => {
    if (!normalizedQuery) {
      return true;
    }

    const searchableFields = [
      script.meta?.name,
      script.meta?.desc,
      script.fileName,
      script.filePath,
      script.language,
      script.status,
    ];

    return searchableFields.some((field) =>
      field?.toLowerCase().includes(normalizedQuery),
    );
  };
  // Keep filtering and sorting local to the current scan result so the dashboard
  // stays responsive without adding another global store layer.
  const compareScripts = (left: ScriptAsset, right: ScriptAsset) => {
    const getScriptName = (script: ScriptAsset) => script.meta?.name ?? script.fileName;

    if (sortMode === "name") {
      return getScriptName(left).localeCompare(getScriptName(right));
    }

    if (sortMode === "language") {
      return left.language.localeCompare(right.language) || getScriptName(left).localeCompare(getScriptName(right));
    }

    return left.filePath.localeCompare(right.filePath);
  };
  const configuredScripts = [...scanState.configuredScripts]
    .filter(filterScript)
    .sort(compareScripts);
  const pendingScripts = [...scanState.pendingScripts]
    .filter(filterScript)
    .sort(compareScripts);
  const scripts = [...configuredScripts, ...pendingScripts];
  const selectedScript =
    scripts.find((item) => item.id === selectedScriptId) ?? scripts[0] ?? null;

  useEffect(() => {
    if (scripts.length === 0) {
      if (selectedScriptId !== null) {
        setSelectedScriptId(null);
      }
      return;
    }

    if (!scripts.some((item) => item.id === selectedScriptId)) {
      setSelectedScriptId(scripts[0].id);
    }
  }, [scripts, selectedScriptId]);
  const scanButtonLabel =
    scanState.status === "scanning"
      ? "Scanning..."
      : scanState.status === "idle"
        ? "Start scan"
        : "Scan again";

  const handleSaveWatchPaths = async () => {
    if (!onSaveWatchPaths) {
      return;
    }

    if (watchPaths.length === 0) {
      setWatchPathValidationError(
        "Add at least one directory before saving watch paths.",
      );
      return;
    }

    setWatchPathValidationError(null);
    await onSaveWatchPaths();
  };

  return (
    <main className="shell dashboard-shell">
      <aside className="workbench-rail panel" aria-label="Workbench navigation">
        <div className="rail-brand">
          <div className="rail-brand-mark">SM</div>
          <div>
            <strong className="rail-brand-name">ScriptMan</strong>
            <p className="rail-brand-copy">Local script desk</p>
          </div>
        </div>

        <nav className="rail-nav">
          <span className="rail-nav-item rail-nav-item-active">Dashboard</span>
          <span className="rail-nav-item">Local-first</span>
        </nav>

        <p className="rail-note">
          Scan, inspect, and run scripts without leaving the local machine.
        </p>
      </aside>

      <section className="workbench-stage" aria-label="Script workspace">
        <header className="panel workspace-toolbar">
          <div className="workspace-title-group">
            <p className="eyebrow">Workbench</p>
            <h1>Local script dashboard</h1>
            <p className="body workspace-body">
              Manual scans keep the tool fast and predictable. Select a script,
              inspect the metadata, then run it from the right-side inspector.
            </p>
          </div>

          <div className="workspace-actions">
            <button
              type="button"
              className="button"
              disabled={scanState.status === "scanning"}
              onClick={() => {
                void scanStore.scan();
              }}
            >
              {scanButtonLabel}
            </button>
            {onPickDirectories ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  void onPickDirectories();
                }}
              >
                Add directories
              </button>
            ) : null}
            {onSaveWatchPaths ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={savingWatchPaths}
                onClick={() => {
                  void handleSaveWatchPaths();
                }}
              >
                {savingWatchPaths ? "Saving..." : "Save watch paths"}
              </button>
            ) : null}
          </div>
        </header>

        <div className="summary-grid" aria-label="Scan summary">
          <article className="summary-card">
            <p className="summary-label">Configured</p>
            <p className="summary-value">{scanState.configuredCount}</p>
          </article>
          <article className="summary-card">
            <p className="summary-label">Pending metadata</p>
            <p className="summary-value">{scanState.pendingCount}</p>
          </article>
        </div>

        <section className="panel filter-panel" aria-label="Script list controls">
          <div className="filter-field">
            <label htmlFor="script-filter-input" className="detail-meta-label">
              Filter scripts
            </label>
            <input
              id="script-filter-input"
              type="search"
              className="text-input"
              placeholder="Search by name, path, or language"
              value={filterQuery}
              onChange={(event) => {
                setFilterQuery(event.target.value);
              }}
            />
          </div>
          <div className="filter-field filter-field-compact">
            <label htmlFor="script-sort-select" className="detail-meta-label">
              Sort scripts
            </label>
            <select
              id="script-sort-select"
              className="select-input"
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.target.value as "path" | "name" | "language");
              }}
            >
              <option value="path">Path</option>
              <option value="name">Name</option>
              <option value="language">Language</option>
            </select>
          </div>
        </section>

        <div className="workspace-grid">
          <section className="panel list-panel script-list-panel">
            <div className="section-header">
              <h2>Configured scripts</h2>
              <span className="count-chip">{configuredScripts.length}</span>
            </div>
            {configuredScripts.length === 0 ? (
              <p className="message">Run a scan to see configured scripts here.</p>
            ) : (
              <div className="script-list">
                {configuredScripts.map((script) => (
                  <ScriptCard
                    key={script.id}
                    script={script}
                    selected={selectedScript?.id === script.id}
                    onSelect={(nextScript: ScriptAsset) => {
                      setSelectedScriptId(nextScript.id);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="panel list-panel script-list-panel">
            <div className="section-header">
              <h2>Pending metadata scripts</h2>
              <span className="count-chip">{pendingScripts.length}</span>
            </div>
            {pendingScripts.length === 0 ? (
              <p className="message">No pending scripts from the latest scan.</p>
            ) : (
              <div className="script-list">
                {pendingScripts.map((script) => (
                  <ScriptCard
                    key={script.id}
                    script={script}
                    selected={selectedScript?.id === script.id}
                    onSelect={(nextScript: ScriptAsset) => {
                      setSelectedScriptId(nextScript.id);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="panel list-panel watch-panel">
            <div className="section-header">
              <h2>Saved watch paths</h2>
              <span className="count-chip">{watchPaths.length}</span>
            </div>
            {watchPathValidationError ? (
              <p className="message message-error">{watchPathValidationError}</p>
            ) : null}

            {configError ? (
              <p className="message message-error">{configError}</p>
            ) : null}

            {watchPaths.length === 0 ? (
              <p className="message">
                No saved directories yet. Add at least one folder before saving.
              </p>
            ) : (
              <ul className="path-list">
                {watchPaths.map((path) => (
                  <li key={path} className="path-item">
                    <code>{path}</code>
                    {onRemoveWatchPath ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          setWatchPathValidationError(null);
                          onRemoveWatchPath(path);
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>

      <aside className="workbench-inspector" aria-label="Script inspector">
        <section className="panel detail-panel inspector-panel">
          {selectedScript ? (
            <ScriptDetailPage
              script={selectedScript}
              defaultCwd={defaultCwd}
              deps={detailDeps}
              onMetaSaved={async () => {
                await scanStore.scan();
              }}
            />
          ) : (
            <div className="detail-empty-state">
              <p className="eyebrow">Script detail</p>
              <h2>No script selected yet.</h2>
              <p className="message">
                Run a manual scan first, then choose a script to inspect and run.
              </p>
            </div>
          )}
        </section>
      </aside>
    </main>
  );
}
