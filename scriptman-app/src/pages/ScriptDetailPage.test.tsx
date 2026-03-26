import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EnvCheckResult,
  EnvSetupCommand,
  RunScriptData,
  ScriptAsset,
} from "../types/script";
import ScriptDetailPage from "./ScriptDetailPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createScriptAsset(): ScriptAsset {
  return {
    id: "resize-script",
    filePath: "/scripts/resize.py",
    fileName: "resize.py",
    language: "python",
    status: "Configured",
    meta: {
      name: "Resize Images",
      category: "image",
      desc: "Resize source images quickly.",
      platform: "macos,linux",
      runtime: "python3",
      inputHint: "Choose the source directory.",
      outputHint: "Write resized images into the output directory.",
      deps: ["ffmpeg"],
      params: [
        {
          name: "--input",
          valueType: "path",
          required: true,
          description: "Input directory",
          defaultValue: "/tmp/in",
        },
        {
          name: "--quality",
          valueType: "int",
          required: false,
          description: "Target quality",
          defaultValue: "85",
        },
      ],
    },
  };
}

function createPendingScriptAsset(): ScriptAsset {
  return {
    id: "pending-script",
    filePath: "/scripts/pending.py",
    fileName: "pending.py",
    language: "python",
    status: "PendingMeta",
  };
}

function createEnvCheckResult(overrides: Partial<EnvCheckResult> = {}): EnvCheckResult {
  return {
    ok: true,
    permissionOk: true,
    runtimeOk: true,
    depsOk: true,
    missingItems: [],
    message: "Ready to run.",
    ...overrides,
  };
}

function createRunScriptData(overrides: Partial<RunScriptData> = {}): RunScriptData {
  return {
    executionId: "exec-1",
    started: true,
    ...overrides,
  };
}

function createEnvHint(overrides: Partial<EnvSetupCommand> = {}): EnvSetupCommand {
  return {
    title: "Install ffmpeg",
    command: "brew install ffmpeg",
    ...overrides,
  };
}

describe("ScriptDetailPage", () => {
  it("renders metadata, runs environment checks on mount, and requests install hints when needed", async () => {
    const checkScriptEnv = vi
      .fn<() => Promise<EnvCheckResult>>()
      .mockResolvedValue(
        createEnvCheckResult({
          ok: false,
          depsOk: false,
          missingItems: ["ffmpeg"],
          message: "Missing dependency ffmpeg.",
        }),
      );
    const suggestEnvSetupCommands = vi
      .fn<() => Promise<EnvSetupCommand[]>>()
      .mockResolvedValue([createEnvHint()]);

    render(
      <ScriptDetailPage
        script={createScriptAsset()}
        defaultCwd="/workspace"
        deps={{
          checkScriptEnv,
          suggestEnvSetupCommands,
          saveScriptMeta: vi.fn().mockResolvedValue({ saved: true }),
          runScript: vi.fn<() => Promise<RunScriptData>>().mockResolvedValue(
            createRunScriptData(),
          ),
          stopScript: vi.fn<() => Promise<{ stopped: boolean } | null>>(),
          subscribeToExecutionEvents: vi.fn().mockResolvedValue(() => {}),
        }}
      />,
    );

    expect(screen.getByText("Resize Images")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/tmp/in")).toBeInTheDocument();
    expect(screen.getByDisplayValue("85")).toBeInTheDocument();
    expect(screen.getByText("image")).toBeInTheDocument();
    expect(screen.getByText("macos,linux")).toBeInTheDocument();
    expect(screen.getByText("python3")).toBeInTheDocument();
    expect(screen.getByText("ffmpeg")).toBeInTheDocument();
    expect(screen.getByText("Choose the source directory.")).toBeInTheDocument();
    expect(
      screen.getByText("Write resized images into the output directory."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(checkScriptEnv).toHaveBeenCalledWith("/scripts/resize.py");
    });

    expect(suggestEnvSetupCommands).toHaveBeenCalledWith({
      scriptPath: "/scripts/resize.py",
      missingItems: ["ffmpeg"],
    });
    expect(await screen.findByText("Install ffmpeg")).toBeInTheDocument();
  });

  it("runs the selected script with current parameter values and default cwd", async () => {
    const user = userEvent.setup();
    const runScript = vi
      .fn<() => Promise<RunScriptData>>()
      .mockResolvedValue(createRunScriptData());

    render(
      <ScriptDetailPage
        script={createScriptAsset()}
        defaultCwd="/workspace"
        deps={{
          checkScriptEnv: vi
            .fn<() => Promise<EnvCheckResult>>()
            .mockResolvedValue(createEnvCheckResult()),
          suggestEnvSetupCommands: vi
            .fn<() => Promise<EnvSetupCommand[]>>()
            .mockResolvedValue([]),
          saveScriptMeta: vi.fn().mockResolvedValue({ saved: true }),
          runScript,
          stopScript: vi.fn<() => Promise<{ stopped: boolean } | null>>(),
          subscribeToExecutionEvents: vi.fn().mockResolvedValue(() => {}),
        }}
      />,
    );

    await user.clear(screen.getByLabelText("--input"));
    await user.type(screen.getByLabelText("--input"), "/tmp/source");
    await user.clear(screen.getByLabelText("--quality"));
    await user.type(screen.getByLabelText("--quality"), "92");
    await user.click(screen.getByRole("button", { name: /run script/i }));

    await waitFor(() => {
      expect(runScript).toHaveBeenCalledWith({
        scriptPath: "/scripts/resize.py",
        args: {
          "--input": "/tmp/source",
          "--quality": 92,
        },
        cwd: "/workspace",
      });
    });
  });

  it("saves minimal metadata for pending scripts and asks the dashboard to refresh", async () => {
    const user = userEvent.setup();
    const saveScriptMeta = vi.fn().mockResolvedValue({ saved: true });
    const onMetaSaved = vi.fn().mockResolvedValue(undefined);

    render(
      <ScriptDetailPage
        script={createPendingScriptAsset()}
        defaultCwd="/workspace"
        onMetaSaved={onMetaSaved}
        deps={{
          checkScriptEnv: vi
            .fn<() => Promise<EnvCheckResult>>()
            .mockResolvedValue(createEnvCheckResult()),
          suggestEnvSetupCommands: vi
            .fn<() => Promise<EnvSetupCommand[]>>()
            .mockResolvedValue([]),
          saveScriptMeta,
          runScript: vi.fn<() => Promise<RunScriptData>>().mockResolvedValue(
            createRunScriptData(),
          ),
          stopScript: vi.fn<() => Promise<{ stopped: boolean } | null>>(),
          subscribeToExecutionEvents: vi.fn().mockResolvedValue(() => {}),
        }}
      />,
    );

    await user.type(screen.getByLabelText(/display name/i), "Pending Script");
    await user.type(screen.getByLabelText(/description/i), "Adds metadata.");
    await user.type(screen.getByLabelText(/category/i), "utility");
    await user.type(screen.getByLabelText(/platform/i), "macos");
    await user.type(screen.getByLabelText(/runtime/i), "python3");
    await user.type(screen.getByLabelText(/dependencies/i), "ffmpeg, git");
    await user.click(screen.getByRole("button", { name: /save metadata/i }));

    await waitFor(() => {
      expect(saveScriptMeta).toHaveBeenCalledWith({
        scriptPath: "/scripts/pending.py",
        meta: {
          name: "Pending Script",
          category: "utility",
          desc: "Adds metadata.",
          platform: "macos",
          runtime: "python3",
          deps: ["ffmpeg", "git"],
          params: [],
        },
      });
    });

    expect(onMetaSaved).toHaveBeenCalledTimes(1);
  });
});
