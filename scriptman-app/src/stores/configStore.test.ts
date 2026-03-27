import { describe, expect, it } from "vitest";

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
});
