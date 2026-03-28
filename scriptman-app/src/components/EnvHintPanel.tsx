import type { EnvSetupCommand } from "../types/script";

interface EnvHintPanelProps {
  commands: EnvSetupCommand[];
}

function buildCommandBlock(note: string | undefined, command: string) {
  return [note?.trim(), command.trim()].filter(Boolean).join("\n");
}

async function copyCommand(commandBlock: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(commandBlock);
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
      <ul
        className="env-command-list"
        aria-label="Install suggestions list"
      >
        {commands.map((item) => (
          <li key={`${item.title}-${item.command}`} className="env-command-item">
            <strong className="env-command-title">{item.title}</strong>
            <pre className="env-command-block">
              <code>{buildCommandBlock(item.note, item.command)}</code>
            </pre>
            <div className="action-row">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  void copyCommand(buildCommandBlock(item.note, item.command));
                }}
              >
                Copy command
              </button>
              {item.requiresPrivilege ? (
                <span className="param-intent">May need admin</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
