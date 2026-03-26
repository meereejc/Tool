import {
  Fragment,
  useDeferredValue,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

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

const COL_COUNT = 7;

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
  const getScriptTitle = (script: ScriptAsset) => script.meta?.name ?? script.fileName;
  const getScriptDescription = (script: ScriptAsset) =>
    script.meta?.desc ??
    (script.status === "PendingMeta"
      ? "Metadata is still missing for this script."
      : "No description available.");
  const getScriptCategory = (script: ScriptAsset) =>
    script.meta?.category?.trim() || "\u672A\u5206\u7C7B";
  const getScriptPlatform = (script: ScriptAsset) =>
    script.meta?.platform || "Any";
  const getScriptRuntime = (script: ScriptAsset) =>
    script.meta?.runtime || "Auto";
  const getScriptDeps = (script: ScriptAsset) =>
    (script.meta?.deps?.length ?? 0) > 0
      ? script.meta!.deps.join(", ")
      : "\u2014";
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
  const compareScripts = (left: ScriptAsset, right: ScriptAsset) => {
    if (sortMode === "name") {
      return getScriptTitle(left).localeCompare(getScriptTitle(right));
    }

    if (sortMode === "language") {
      return left.language.localeCompare(right.language) || getScriptTitle(left).localeCompare(getScriptTitle(right));
    }

    return left.filePath.localeCompare(right.filePath);
  };
  const visibleScripts = [...scanState.configuredScripts, ...scanState.pendingScripts]
    .filter(filterScript)
    .sort(compareScripts);
  const selectedScript =
    visibleScripts.find((item) => item.id === selectedScriptId) ?? visibleScripts[0] ?? null;

  useEffect(() => {
    if (visibleScripts.length === 0) {
      if (selectedScriptId !== null) {
        setSelectedScriptId(null);
      }
      return;
    }

    if (!visibleScripts.some((item) => item.id === selectedScriptId)) {
      setSelectedScriptId(visibleScripts[0].id);
    }
  }, [visibleScripts, selectedScriptId]);
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
      {/* ── Topbar: brand + nav + actions + summary ── */}
      <header className="topbar panel" aria-label="Workbench topbar">
        <div className="topbar-brand">
          <div className="topbar-brand-mark">SM</div>
          <strong className="topbar-brand-name">ScriptMan</strong>
        </div>

        <nav className="topbar-nav">
          <span className="topbar-nav-item topbar-nav-item-active">Dashboard</span>
          <span className="topbar-nav-item">Watch paths</span>
        </nav>

        <div className="topbar-actions">
          <button
            type="button"
            className="button"
            disabled={scanState.status === "scanning"}
            onClick={() => {
              void scanStore.scan({ paths: watchPaths });
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

        <div className="topbar-summary" aria-label="Scan summary">
          <article className="summary-card">
            <p className="summary-label">Configured</p>
            <p className="summary-value">{scanState.configuredCount}</p>
          </article>
          <article className="summary-card">
            <p className="summary-label">Pending</p>
            <p className="summary-value">{scanState.pendingCount}</p>
          </article>
          <article className="summary-card summary-card-wide">
            <p className="summary-label">Watch paths</p>
            <p className="summary-inline-value">
              {watchPaths.length === 0
                ? "No saved directories."
                : `${watchPaths.length} saved`}
            </p>
          </article>
        </div>
      </header>

      {/* ── Script inventory table ── */}
      <section className="panel inventory-panel">
        <div className="inventory-panel-header">
          <div className="inventory-panel-title">
            <h2>Scripts</h2>
            <p className="message">
              Select a row to inspect metadata, environment state, and run controls.
            </p>
          </div>

          <div className="inventory-filters" aria-label="Script list controls">
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
          </div>
        </div>

        <div className="inventory-table-wrap">
          <table className="inventory-table" aria-label="Script inventory table">
            <thead>
              <tr>
                <th scope="col">{"\u5206\u7C7B"}</th>
                <th scope="col">{"\u811A\u672C\u540D"}</th>
                <th scope="col">{"\u8DEF\u5F84"}</th>
                <th scope="col">{"\u8BED\u8A00"}</th>
                <th scope="col">{"\u72B6\u6001"}</th>
                <th scope="col">{"\u8BE6\u60C5"}</th>
                <th scope="col">{"\u64CD\u4F5C"}</th>
              </tr>
            </thead>
            <tbody>
              {visibleScripts.length === 0 ? (
                <tr className="inventory-empty-row">
                  <td colSpan={COL_COUNT}>Run a scan to see scripts here.</td>
                </tr>
              ) : (
                visibleScripts.map((script) => {
                  const title = getScriptTitle(script);
                  const description = getScriptDescription(script);
                  const isSelected = selectedScript?.id === script.id;
                  const actionLabel = script.status === "PendingMeta" ? "\u8865\u5168" : "\u67E5\u770B";

                  return (
                    <Fragment key={script.id}>
                      <tr
                        className={`inventory-row${isSelected ? " inventory-row-selected" : ""}`}
                        onClick={() => {
                          setSelectedScriptId(script.id);
                        }}
                      >
                        <td>
                          <span className="table-pill category-pill">
                            {getScriptCategory(script)}
                          </span>
                        </td>
                        <td>
                          <div className="inventory-script-name">
                            <strong>{title}</strong>
                            <span>{description}</span>
                          </div>
                        </td>
                        <td className="inventory-path-cell" title={script.filePath}>
                          <code>{script.filePath}</code>
                        </td>
                        <td>
                          <span className="table-language">{script.language}</span>
                        </td>
                        <td>
                          <span
                            className={`table-pill status-pill${script.status === "PendingMeta" ? " status-pill-pending" : " status-pill-configured"}`}
                          >
                            {script.status}
                          </span>
                        </td>
                        <td>
                          <div className="detail-cell">
                            <span><b>{"\u5E73\u53F0"}</b> {getScriptPlatform(script)}</span>
                            <span><b>{"\u8FD0\u884C\u65F6"}</b> {getScriptRuntime(script)}</span>
                            <span><b>{"\u4F9D\u8D56"}</b> {getScriptDeps(script)}</span>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="table-link-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedScriptId(script.id);
                            }}
                          >
                            {actionLabel}
                          </button>
                        </td>
                      </tr>
                      {isSelected ? (
                        <tr className="detail-expand-row">
                          <td colSpan={COL_COUNT}>
                            <div className="detail-expand-content">
                              <ScriptDetailPage
                                script={script}
                                defaultCwd={defaultCwd}
                                compact
                                deps={detailDeps}
                                onMetaSaved={async () => {
                                  await scanStore.scan({ paths: watchPaths });
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Watch paths ── */}
      <section className="panel watch-panel">
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
    </main>
  );
}
