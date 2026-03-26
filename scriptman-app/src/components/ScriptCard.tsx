import type { ScriptAsset } from "../types/script";

interface ScriptCardProps {
  script: ScriptAsset;
  selected: boolean;
  onSelect: (script: ScriptAsset) => void;
}

export default function ScriptCard({
  script,
  selected,
  onSelect,
}: ScriptCardProps) {
  const title = script.meta?.name ?? script.fileName;
  const description =
    script.meta?.desc ??
    (script.status === "PendingMeta"
      ? "Metadata is still missing for this script."
      : "No description available.");

  return (
    <button
      type="button"
      className={`script-card${selected ? " script-card-selected" : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(script)}
    >
      <div className="script-card-header">
        <div className="script-card-title-group">
          <strong>{title}</strong>
          {title !== script.fileName ? (
            <span className="script-card-file">{script.fileName}</span>
          ) : null}
        </div>
        <span className="script-pill">{script.language}</span>
      </div>
      <p className="script-card-description">{description}</p>
      <div className="script-card-footer">
        <div className="script-card-meta">
          <span className="script-pill script-pill-secondary">{script.status}</span>
        </div>
        <code>{script.filePath}</code>
      </div>
    </button>
  );
}
