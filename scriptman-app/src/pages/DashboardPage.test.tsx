import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createScanSummaryStore } from "../stores/scanSummaryStore";
import type { ScanResult, ScriptAsset } from "../types/script";
import {
  __resetScriptDetailEnvCacheForTests,
  type ScriptDetailPageDeps,
} from "./ScriptDetailPage";
import DashboardPage from "./DashboardPage";

afterEach(() => {
  cleanup();
  __resetScriptDetailEnvCacheForTests();
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
  it("renders the topbar, inventory table, and watch paths", () => {
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
    expect(screen.getByLabelText("Workbench topbar")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /script inventory table/i }),
    ).toBeInTheDocument();
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
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(within(summary).getByText("Watch paths")).toBeInTheDocument();
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

  it("scans with the current dashboard watch paths without requiring a prior save", async () => {
    const user = userEvent.setup();
    const scanDirectories = vi
      .fn()
      .mockResolvedValue(createScanResult(1, 0));
    const store = createScanSummaryStore({
      scanDirectories,
    });

    render(
      <DashboardPage
        watchPaths={["/Users/mc/Documents/3dgs/3dgsYouHua"]}
        detailDeps={createDetailDeps()}
        scanStore={store}
      />,
    );

    await user.click(screen.getByRole("button", { name: /start scan/i }));

    expect(scanDirectories).toHaveBeenCalledWith({
      paths: ["/Users/mc/Documents/3dgs/3dgsYouHua"],
    });
  });

  it("shows scanned script rows after a manual scan", async () => {
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

    const table = await screen.findByRole("table", {
      name: /script inventory table/i,
    });

    expect(within(table).getByRole("columnheader", { name: "分类" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "脚本名" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "路径" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "语言" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "详情" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(screen.getByText("Image Resize")).toBeInTheDocument();
    expect(screen.getByText("pending-task.py")).toBeInTheDocument();
    expect(screen.getByText("Resize source images.")).toBeInTheDocument();
  });

  it("toggles the inline detail row when the same script row is clicked twice", async () => {
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
        pendingScripts: [],
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

    expect(
      screen.queryByRole("button", { name: /run script/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Image Resize"));

    expect(
      await screen.findByRole("button", { name: /run script/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Image Resize"));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /run script/i }),
      ).not.toBeInTheDocument();
    });
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

  it("filters scripts and supports the expanded pure sort options", async () => {
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
              category: "utility",
              deps: [],
              params: [],
            },
          }),
          createScriptAsset("gamma-script", {
            fileName: "gamma.py",
            filePath: "/tmp/gamma/gamma.py",
            meta: {
              name: "Gamma Script",
              desc: "Gamma task",
              category: "archive",
              deps: [],
              params: [],
            },
          }),
        ],
        pendingScripts: [
          createScriptAsset("alpha-script", {
            fileName: "alpha.py",
            filePath: "/tmp/alpha/alpha.py",
            status: "PendingMeta",
            meta: {
              name: "Alpha Script",
              desc: "Alpha task",
              category: "archive",
              deps: [],
              params: [],
            },
          }),
        ],
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
    const table = screen.getByRole("table", { name: /script inventory table/i });

    await user.type(screen.getByLabelText(/filter scripts/i), "beta");

    expect(within(table).getByText("Beta Script")).toBeInTheDocument();
    expect(within(table).queryByText("Gamma Script")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/filter scripts/i));
    const sortSelect = screen.getByLabelText(/sort scripts/i);

    expect(
      within(sortSelect).getByRole("option", { name: "Category" }),
    ).toBeInTheDocument();
    expect(
      within(sortSelect).getByRole("option", { name: "Status" }),
    ).toBeInTheDocument();

    await user.selectOptions(sortSelect, "category");

    const rows = within(table).getAllByRole("row");

    expect(rows[1]).toHaveTextContent("Alpha Script");
    expect(rows[2]).toHaveTextContent("Gamma Script");
    expect(rows[3]).toHaveTextContent("Beta Script");

    await user.selectOptions(sortSelect, "status");

    const statusRows = within(table).getAllByRole("row");

    expect(statusRows[1]).toHaveTextContent("Beta Script");
    expect(statusRows[2]).toHaveTextContent("Gamma Script");
    expect(statusRows[3]).toHaveTextContent("Alpha Script");
  });

  it("reuses the previous environment check when reopening the same script detail", async () => {
    const user = userEvent.setup();
    const checkScriptEnv = vi.fn().mockResolvedValue({
      ok: true,
      permissionOk: true,
      runtimeOk: true,
      depsOk: true,
      missingItems: [],
      message: "Ready to run.",
    });
    const store = createScanSummaryStore({
      scanDirectories: async () => ({
        configuredScripts: [
          createScriptAsset("perf-script", {
            filePath: "/tmp/perf-script.py",
            fileName: "perf-script.py",
            meta: {
              name: "Perf Script",
              desc: "Used for reopen performance.",
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
        detailDeps={{
          checkScriptEnv,
          suggestEnvSetupCommands: vi.fn().mockResolvedValue([]),
          saveScriptMeta: vi.fn().mockResolvedValue({ saved: true }),
          runScript: vi.fn().mockResolvedValue({
            executionId: "exec-1",
            started: true,
          }),
          stopScript: vi.fn().mockResolvedValue({ stopped: true }),
          subscribeToExecutionEvents: vi.fn().mockResolvedValue(() => {}),
        }}
        scanStore={store}
      />,
    );

    await user.click(screen.getByRole("button", { name: /start scan/i }));
    await user.click(screen.getByText("Perf Script"));

    await waitFor(() => {
      expect(checkScriptEnv).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByText("Perf Script"));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /run script/i }),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByText("Perf Script"));
    await screen.findByRole("button", { name: /run script/i });

    expect(checkScriptEnv).toHaveBeenCalledTimes(1);
  });
});
