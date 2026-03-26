import { describe, expect, it, vi } from "vitest";

import type { ScanResult, ScriptAsset } from "../types/script";
import { createScanSummaryStore } from "./scanSummaryStore";

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

function createScanResult({
  configuredCount,
  pendingCount,
}: {
  configuredCount: number;
  pendingCount: number;
}): ScanResult {
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

describe("createScanSummaryStore", () => {
  it("starts from an idle summary state", () => {
    const store = createScanSummaryStore({
      scanDirectories: async () => createScanResult({ configuredCount: 0, pendingCount: 0 }),
    });

    expect(store.getState()).toEqual({
      status: "idle",
      configuredCount: 0,
      pendingCount: 0,
      configuredScripts: [],
      pendingScripts: [],
      error: null,
    });
  });

  it("switches to scanning first and then records the returned counts", async () => {
    let resolveScan: ((result: ScanResult) => void) | undefined;
    const store = createScanSummaryStore({
      scanDirectories: () =>
        new Promise<ScanResult>((resolve) => {
          resolveScan = resolve;
        }),
    });

    const scanPromise = store.scan();

    expect(store.getState()).toMatchObject({
      status: "scanning",
      configuredCount: 0,
      pendingCount: 0,
      configuredScripts: [],
      pendingScripts: [],
      error: null,
    });

    resolveScan?.(createScanResult({ configuredCount: 2, pendingCount: 3 }));
    await scanPromise;

    expect(store.getState()).toEqual({
      status: "ready",
      configuredCount: 2,
      pendingCount: 3,
      configuredScripts: expect.arrayContaining([
        expect.objectContaining({ id: "configured-0" }),
        expect.objectContaining({ id: "configured-1" }),
      ]),
      pendingScripts: expect.arrayContaining([
        expect.objectContaining({ id: "pending-0" }),
        expect.objectContaining({ id: "pending-1" }),
        expect.objectContaining({ id: "pending-2" }),
      ]),
      error: null,
    });
  });

  it("keeps the last successful counts when a later scan fails", async () => {
    const store = createScanSummaryStore({
      scanDirectories: vi
        .fn()
        .mockResolvedValueOnce(createScanResult({ configuredCount: 4, pendingCount: 1 }))
        .mockRejectedValueOnce(new Error("scan failed")),
    });

    await store.scan();
    await store.scan();

    expect(store.getState()).toEqual({
      status: "error",
      configuredCount: 4,
      pendingCount: 1,
      configuredScripts: expect.arrayContaining([
        expect.objectContaining({ id: "configured-0" }),
      ]),
      pendingScripts: expect.arrayContaining([
        expect.objectContaining({ id: "pending-0" }),
      ]),
      error: "scan failed",
    });
  });
});
