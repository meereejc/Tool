import { useState } from "react";

interface OnboardingPageProps {
  watchPaths: string[];
  saving: boolean;
  error: string | null;
  onPickDirectories: () => void | Promise<void>;
  onRemoveWatchPath: (path: string) => void;
  onSave: () => void | Promise<void>;
}

export default function OnboardingPage({
  watchPaths,
  saving,
  error,
  onPickDirectories,
  onRemoveWatchPath,
  onSave,
}: OnboardingPageProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSave = async () => {
    if (watchPaths.length === 0) {
      setValidationError("Add at least one directory before continuing.");
      return;
    }

    setValidationError(null);
    await onSave();
  };

  return (
    <main className="shell">
      <section className="panel hero-panel">
        <p className="eyebrow">Phase 1</p>
        <h1>Configure the folders ScriptMan should watch.</h1>
        <p className="body">
          Start by selecting one or more script directories. ScriptMan will use
          these saved paths as the input for the next scanning phase.
        </p>
        <div className="action-row">
          <button
            type="button"
            className="button"
            onClick={() => void onPickDirectories()}
          >
            Add directories
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save and continue"}
          </button>
        </div>
      </section>

      <section className="panel list-panel">
        <div className="section-header">
          <h2>Selected watch paths</h2>
          <span className="count-chip">{watchPaths.length}</span>
        </div>

        {validationError ? (
          <p className="message message-error">{validationError}</p>
        ) : null}

        {error ? <p className="message message-error">{error}</p> : null}

        {watchPaths.length === 0 ? (
          <p className="message">
            No directories selected yet. Add at least one folder before saving.
          </p>
        ) : (
          <ul className="path-list">
            {watchPaths.map((path) => (
              <li key={path} className="path-item">
                <code>{path}</code>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onRemoveWatchPath(path)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
