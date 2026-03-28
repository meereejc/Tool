import { describe, expect, it } from "vitest";

import {
  buildTauriEnv,
  formatMissingCargoMessage,
  getTauriBinary,
  MACOS_HOMEBREW_RUSTUP_BIN,
} from "../../run-tauri.js";

describe("buildTauriEnv", () => {
  it("prepends the Homebrew rustup bin path on macOS when available", () => {
    const env = buildTauriEnv(
      { PATH: "/usr/bin:/bin" },
      {
        platform: "darwin",
        pathExists: (candidate) => candidate === MACOS_HOMEBREW_RUSTUP_BIN,
      },
    );

    expect(env.PATH?.split(":")[0]).toBe(MACOS_HOMEBREW_RUSTUP_BIN);
  });

  it("does not duplicate the Homebrew rustup bin path on macOS", () => {
    const env = buildTauriEnv(
      { PATH: `${MACOS_HOMEBREW_RUSTUP_BIN}:/usr/bin:/bin` },
      {
        platform: "darwin",
        pathExists: () => true,
      },
    );

    expect(
      env.PATH?.split(":").filter((item) => item === MACOS_HOMEBREW_RUSTUP_BIN),
    ).toHaveLength(1);
  });

  it("does not inject the Homebrew rustup path on Windows", () => {
    const env = buildTauriEnv(
      { Path: "C:\\Windows\\System32" },
      {
        platform: "win32",
        pathExists: () => true,
      },
    );

    expect(env.Path).toBe("C:\\Windows\\System32");
  });
});

describe("getTauriBinary", () => {
  it("returns the Windows shim name on win32", () => {
    expect(getTauriBinary("win32")).toBe("tauri.cmd");
  });

  it("returns the standard binary name on non-Windows platforms", () => {
    expect(getTauriBinary("darwin")).toBe("tauri");
    expect(getTauriBinary("linux")).toBe("tauri");
  });
});

describe("formatMissingCargoMessage", () => {
  it("mentions PATH guidance for Windows", () => {
    expect(formatMissingCargoMessage("win32")).toMatch(/PATH/i);
  });

  it("mentions Homebrew rustup guidance for macOS", () => {
    expect(formatMissingCargoMessage("darwin")).toMatch(/opt\/homebrew\/opt\/rustup\/bin/i);
  });
});
