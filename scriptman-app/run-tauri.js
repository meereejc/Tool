import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const MACOS_HOMEBREW_RUSTUP_BIN = "/opt/homebrew/opt/rustup/bin";

function getPathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

export function buildTauriEnv(
  baseEnv = process.env,
  {
    platform = process.platform,
    pathExists = fs.existsSync,
  } = {},
) {
  const env = { ...baseEnv };
  const pathKey = getPathKey(env);
  const currentPath = env[pathKey] ?? "";

  if (platform === "darwin" && pathExists(MACOS_HOMEBREW_RUSTUP_BIN)) {
    const entries = currentPath.split(path.delimiter).filter(Boolean);
    if (!entries.includes(MACOS_HOMEBREW_RUSTUP_BIN)) {
      env[pathKey] = [MACOS_HOMEBREW_RUSTUP_BIN, ...entries].join(path.delimiter);
    }
  }

  return env;
}

export function getTauriBinary(platform = process.platform) {
  return platform === "win32" ? "tauri.cmd" : "tauri";
}

function getCargoBinary(platform = process.platform) {
  return platform === "win32" ? "cargo.exe" : "cargo";
}

export function formatMissingCargoMessage(platform = process.platform) {
  if (platform === "darwin") {
    return [
      "Rust is required to start the Tauri development app, but `cargo` was not found.",
      "Install Rust with rustup, or make sure `/opt/homebrew/opt/rustup/bin` is available.",
      "Example: export PATH=\"/opt/homebrew/opt/rustup/bin:$PATH\"",
    ].join("\n");
  }

  if (platform === "win32") {
    return [
      "Rust is required to start the Tauri development app, but `cargo` was not found.",
      "Install Rust with rustup-init for Windows, then reopen the terminal so Cargo is on PATH.",
    ].join("\n");
  }

  return [
    "Rust is required to start the Tauri development app, but `cargo` was not found.",
    "Install Rust with rustup and make sure Cargo is on PATH.",
  ].join("\n");
}

export function hasCargo(
  env,
  {
    platform = process.platform,
    spawnSyncImpl = spawnSync,
  } = {},
) {
  const result = spawnSyncImpl(getCargoBinary(platform), ["--version"], {
    env,
    stdio: "ignore",
  });

  return result.status === 0;
}

export async function runTauri(
  args,
  {
    platform = process.platform,
    env = buildTauriEnv(process.env, { platform }),
    spawnImpl = spawn,
    spawnSyncImpl = spawnSync,
  } = {},
) {
  if (!hasCargo(env, { platform, spawnSyncImpl })) {
    console.error(formatMissingCargoMessage(platform));
    return 1;
  }

  return await new Promise((resolve, reject) => {
    const child = spawnImpl(getTauriBinary(platform), args, {
      env,
      shell: platform === "win32",
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(signal ? 1 : (code ?? 1));
    });
  });
}

async function main() {
  const code = await runTauri(process.argv.slice(2));
  process.exit(code);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main();
}
