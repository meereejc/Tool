import type { EnvSetupCommand } from "../types/script";

interface EnvHintPanelProps {
  commands: EnvSetupCommand[];
}

async function copyCommand(command: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(command);
}

export default function EnvHintPanel({ commands }: EnvHintPanelProps) {
  if (commands.length === 0) {
    return null;
  }

  return (
    <section className="env-hint-panel">
      <div className="section-header">
        <h3>Install suggestions</h3>
      </div>
      <div className="env-command-list">
        {commands.map((item) => (
          <article key={`${item.title}-${item.command}`} className="env-command-card">
            <strong>{item.title}</strong>
            {item.note ? <p className="message">{item.note}</p> : null}
            <code>{item.command}</code>
            <div className="action-row">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  void copyCommand(item.command);
                }}
              >
                Copy command
              </button>
              {item.requiresPrivilege ? (
                <span className="param-intent">May need admin</span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
