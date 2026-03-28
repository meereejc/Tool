import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import EnvHintPanel from "./EnvHintPanel";

describe("EnvHintPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders environment notes and commands inside one code block", () => {
    const { container } = render(
      <EnvHintPanel
        commands={[
          {
            title: "Install python",
            note: "export PATH=\"/opt/homebrew/opt/rustup/bin:$PATH\"",
            command: "python3 ./scripts/demo.py",
          },
        ]}
      />,
    );

    const suggestionsList = screen.getByRole("list", {
      name: /install suggestions list/i,
    });
    const codeBlock = within(suggestionsList).getByText(
      (_, element) =>
        element?.tagName === "CODE" &&
        element.textContent ===
          'export PATH="/opt/homebrew/opt/rustup/bin:$PATH"\npython3 ./scripts/demo.py',
    );

    expect(codeBlock.tagName).toBe("CODE");
    expect(container.querySelectorAll(".env-command-item .message")).toHaveLength(0);
    expect(container.querySelectorAll(".env-command-block")).toHaveLength(1);
  });

  it("copies the full code block content", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <EnvHintPanel
        commands={[
          {
            title: "Install python",
            note: "source ~/.venv/bin/activate",
            command: "python3 ./scripts/demo.py --help",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /copy command/i }));

    expect(writeText).toHaveBeenCalledWith(
      "source ~/.venv/bin/activate\npython3 ./scripts/demo.py --help",
    );
  });
});
