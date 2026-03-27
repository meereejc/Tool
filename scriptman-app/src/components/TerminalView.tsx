import type { ExecutionExitEvent, ExecutionLogEvent } from "../types/script";

interface TerminalViewProps {
  logs: ExecutionLogEvent[];
  exitEvent: ExecutionExitEvent | null;
}

export default function TerminalView({ logs, exitEvent }: TerminalViewProps) {
  return (
    <section className="terminal-panel">
      <div className="section-header">
        <h3>Execution log</h3>
        {exitEvent ? (
          <span className="script-pill script-pill-secondary">
            Exit {exitEvent.exitCode ?? "signal"}
          </span>
        ) : null}
      </div>
      {logs.length === 0 ? (
        <p className="message">No output yet. Run the script to stream logs here.</p>
      ) : (
        <pre className="terminal-output">
          {logs.map((entry, index) => (
            <div key={`${entry.stream}-${index}`}>
              <span className="terminal-stream">{entry.stream}</span>
              <span>{entry.line}</span>
            </div>
          ))}
        </pre>
      )}
    </section>
  );
}
