import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createScanSummaryStore } from "../stores/scanSummaryStore";
import type { ScanResult, ScriptAsset } from "../types/script";
import type { ScriptDetailPageDeps } from "./ScriptDetailPage";
import DashboardPage from "./DashboardPage";

afterEach(() => {
  cleanup();
});

function createScriptAsset(
  id: string,
  overrides: Partial<ScriptAsset> = {},
): ScriptAsset {
  return {
    id,
    filePath: `/tmp/${id}.py`,
    fileName: `${id}.py`,
    language: "python",
    status: "Configured",
    meta: {
      name: id,
      deps: [],
      params: [],
    },
    ...overrides,
  };
}

function createScanResult(configuredCount: number, pendingCount: number): ScanResult {
  return {
    configuredScripts: Array.from({ length: configuredCount }, (_, index) =>
      createScriptAsset(`configured-${index}`),
    ),
    pendingScripts: Array.from({ length: pendingCount }, (_, index) => ({
      ...createScriptAsset(`pending-${index}`),
      status: "PendingMeta",
    })),
    ignoredCount: 0,
    errors: [],
  };
}

function createDetailDeps(): ScriptDetailPageDeps {
  return {
    checkScriptEnv: vi.fn().mockResolvedValue({
      ok: true,
      permissionOk: true,
      runtimeOk: true,
      depsOk: true,
      missingItems: [],
      message: "Ready to run.",
    }),
    suggestEnvSetupCommands: vi.fn().mockResolvedValue([]),
    saveScriptMeta: vi.fn().mockResolvedValue({ saved: true }),
    runScript: vi.fn().mockResolvedValue({
      executionId: "exec-1",
      started: true,
    }),
    stopScript: vi.fn().mockResolvedValue({ stopped: true }),
    subscribeToExecutionEvents: vi.fn().mockResolvedValue(() => {}),
  };
}

describe("DashboardPage", () => {
  it("renders the workbench navigation, workspace, and inspector shell", () => {
    const store = createScanSummaryStore({
      scanDirectories: async () => createScanResult(0, 0),
    });

    render(
      <DashboardPage
        watchPaths={["/scripts/a"]}
        detailDeps={createDetailDeps()}
        scanStore={store}
      />,
    );

    expect(screen.getByText("ScriptMan")).toBeInTheDocument();
    expect(screen.getByLabelText("Workbench navigation")).toBeInTheDocument();
    expect(screen.getByLabelText("Script workspace")).toBeInTheDocument();
    expect(screen.getByLabelText("Script inspector")).toBeInTheDocument();
  });

  it("shows the manual scan summary and the saved watch paths", () => {
    const store = createScanSummaryStore({
      scanDirectories: async () => createScanResult(0, 0),
    });

    render(
      <DashboardPage
        watchPaths={["/scripts/a", "/scripts/b"]}
        detailDeps={createDetailDeps()}
        scanStore={store}
      />,
    );

    const summary = screen.getByLabelText("Scan summary");

    expect(
      screen.getByRole("button", { name: /start scan/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("Pending metadata")).toBeInTheDocument();
    expect(within(summary).getAllByText("0")).toHaveLength(2);
    expect(screen.getByText("/scripts/a")).toBeInTheDocument();
    expect(screen.getByText("/scripts/b")).toBeInTheDocument();
  });

  it("disables the button while scanning and shows the latest summary when done", async () => {
    const user = userEvent.setup();
    let resolveScan: ((result: ScanResult) => void) | undefined;
    const store = createScanSummaryStore({
      scanDirectories: () =>
        new Promise<ScanResult>((resolve) => {
          resolveScan = resolve;
        }),
    });

    render(
      <DashboardPage
        watchPaths={["/scripts/a"]}
        detailDeps={createDetailDeps()}
        scanStore={store}
      />,
    );

    const button = screen.getByRole("button", { name: /start scan/i });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Scanning...");

    resolveScan?.(createScanResult(4, 1));

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent("Scan again");
    });

    const summary = screen.getByLabelText("Scan summary");

    expect(within(summary).getByText("4")).toBeInTheDocument();
    expect(within(summary).getByText("1")).toBeInTheDocument();
  });

  it("shows scanned script lists and opens the first configured script in the detail view", async () => {
    const user = userEvent.setup();
    const store = createScanSummaryStore({
      scanDirectories: async () => ({
        configuredScripts: [
          createScriptAsset("Image Resize", {
            meta: {
              name: "Image Resize",
              desc: "Resize source images.",
              deps: [],
              params: [],
            },
          }),
        ],
        pendingScripts: [
          createScriptAsset("pending-task", {
            status: "PendingMeta",
            fileName: "pending-task.py",
            meta: undefined,
          }),
        ],
        ignoredCount: 0,
        errors: [],
      }),
    });

    render(
      <DashboardPage
        watchPaths={["/scripts/a"]}
        defaultCwd="/workspace"
        detailDeps={createDetailDeps()}
        scanStore={store}
      />,
    );

    await user.click(screen.getByRole("button", { name: /start scan/i }));

    expect(await screen.findByText("Configured scripts")).toBeInTheDocument();
    expect(screen.getByText("Pending metadata scripts")).toBeInTheDocument();
    expect(screen.getAllByText("Image Resize")).toHaveLength(2);
    expect(screen.getByText("pending-task.py")).toBeInTheDocument();
    expect(screen.getAllByText("Resize source images.")).toHaveLength(2);
    expect(screen.getByText("/workspace")).toBeInTheDocument();
  });

  it("lets the user manage saved watch paths after onboarding", async () => {
    const user = userEvent.setup();
    const onPickDirectories = vi.fn().mockResolvedValue(undefined);
    const onRemoveWatchPath = vi.fn();
    const onSaveWatchPaths = vi.fn().mockResolvedValue(undefined);

    render(
      <DashboardPage
        watchPaths={["/scripts/a", "/scripts/b"]}
        savingWatchPaths={false}
        configError={null}
        onPickDirectories={onPickDirectories}
        onRemoveWatchPath={onRemoveWatchPath}
        onSaveWatchPaths={onSaveWatchPaths}
        detailDeps={createDetailDeps()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add directories/i }));
    expect(onPickDirectories).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByRole("button", { name: /^remove$/i })[0]);
    expect(onRemoveWatchPath).toHaveBeenCalledWith("/scripts/a");

    await user.click(screen.getByRole("button", { name: /save watch paths/i }));
    expect(onSaveWatchPaths).toHaveBeenCalledTimes(1);
  });

  it("filters and sorts scripts from the workbench controls", async () => {
    const user = userEvent.setup();
    const store = createScanSummaryStore({
      scanDirectories: async () => ({
        configuredScripts: [
          createScriptAsset("beta-script", {
            fileName: "beta.py",
            filePath: "/tmp/zeta/beta.py",
            meta: {
              name: "Beta Script",
              desc: "Beta task",
              deps: [],
              params: [],
            },
          }),
          createScriptAsset("alpha-script", {
            fileName: "alpha.py",
            filePath: "/tmp/alpha/alpha.py",
            meta: {
              name: "Alpha Script",
              desc: "Alpha task",
              deps: [],
              params: [],
            },
          }),
        ],
        pendingScripts: [],
        ignoredCount: 0,
        errors: [],
      }),
    });

    render(
      <DashboardPage
        watchPaths={["/scripts/a"]}
        detailDeps={createDetailDeps()}
        scanStore={store}
      />,
    );

    await user.click(screen.getByRole("button", { name: /start scan/i }));

    await user.type(screen.getByLabelText(/filter scripts/i), "beta");
    const configuredSection = screen
      .getByRole("heading", { name: /configured scripts/i })
      .closest("section");

    expect(configuredSection).not.toBeNull();
    expect(
      within(configuredSection as HTMLElement).getByText("Beta Script"),
    ).toBeInTheDocument();
    expect(
      within(configuredSection as HTMLElement).queryByText("Alpha Script"),
    ).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/filter scripts/i));
    await user.selectOptions(screen.getByLabelText(/sort scripts/i), "name");

    expect(
      within(configuredSection as HTMLElement).getAllByRole("button")[0],
    ).toHaveTextContent("Alpha Script");
  });
});
