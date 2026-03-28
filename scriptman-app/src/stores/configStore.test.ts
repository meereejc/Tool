import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import { createDefaultConfig, needsOnboarding } from "../types/config";
import { createConfigStore } from "./configStore";

describe("needsOnboarding", () => {
  it("returns true when watchPaths is empty", () => {
    expect(needsOnboarding(createDefaultConfig())).toBe(true);
  });
});

describe("createConfigStore", () => {
  it("uses the lightweight default config shape", () => {
    expect(createDefaultConfig()).toEqual({
      watchPaths: [],
      scanLooseMode: false,
    });
  });

  it("marks onboarding as required when loaded config has no watch paths", async () => {
    const store = createConfigStore({
      loadConfig: async () => createDefaultConfig(),
      saveConfig: async () => ({ saved: true }),
      selectDirectories: async () => ({ paths: [] }),
    });

    await store.load();

    expect(store.getState().needsOnboarding).toBe(true);
  });

  it("persists config and clears onboarding flag after save", async () => {
    const store = createConfigStore({
      loadConfig: async () => createDefaultConfig(),
      saveConfig: async () => ({ saved: true }),
      selectDirectories: async () => ({ paths: [] }),
    });

    await store.save({
      ...createDefaultConfig(),
      watchPaths: ["/tmp/scripts"],
    });

    expect(store.getState().needsOnboarding).toBe(false);
  });

  it("persists watch path removal immediately", async () => {
    const saveConfig = vi.fn().mockResolvedValue({ saved: true });
    const store = createConfigStore({
      loadConfig: async () => ({
        ...createDefaultConfig(),
        watchPaths: ["/tmp/a", "/tmp/b"],
      }),
      saveConfig,
      selectDirectories: async () => ({ paths: [] }),
    });

    await store.load();
    await store.removeWatchPath("/tmp/a");

    expect(saveConfig).toHaveBeenCalledWith({
      ...createDefaultConfig(),
      watchPaths: ["/tmp/b"],
    });
    expect(store.getState().config.watchPaths).toEqual(["/tmp/b"]);
    expect(store.getState().needsOnboarding).toBe(false);
  });

  it("allows removing the last watch path and returns onboarding mode", async () => {
    const saveConfig = vi.fn().mockResolvedValue({ saved: true });
    const store = createConfigStore({
      loadConfig: async () => ({
        ...createDefaultConfig(),
        watchPaths: ["/tmp/a"],
      }),
      saveConfig,
      selectDirectories: async () => ({ paths: [] }),
    });

    await store.load();
    await store.removeWatchPath("/tmp/a");

    expect(saveConfig).toHaveBeenCalledWith(createDefaultConfig());
    expect(store.getState().config.watchPaths).toEqual([]);
    expect(store.getState().needsOnboarding).toBe(true);
  });
});
