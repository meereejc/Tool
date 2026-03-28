export const MACOS_HOMEBREW_RUSTUP_BIN: string;

export interface BuildTauriEnvOptions {
  platform?: string;
  pathExists?: (candidate: string) => boolean;
}

export interface HasCargoOptions {
  platform?: string;
  spawnSyncImpl?: (
    command: string,
    args: string[],
    options: { env: Record<string, string | undefined>; stdio: "ignore" },
  ) => { status: number | null };
}

export interface RunTauriOptions {
  platform?: string;
  env?: Record<string, string | undefined>;
  spawnImpl?: (
    command: string,
    args: string[],
    options: {
      env: Record<string, string | undefined>;
      shell: boolean;
      stdio: "inherit";
    },
  ) => {
    once: (
      event: "error" | "exit",
      listener: (...args: unknown[]) => void,
    ) => unknown;
  };
  spawnSyncImpl?: HasCargoOptions["spawnSyncImpl"];
}

export function buildTauriEnv(
  baseEnv?: Record<string, string | undefined>,
  options?: BuildTauriEnvOptions,
): Record<string, string | undefined>;

export function getTauriBinary(platform?: string): string;

export function formatMissingCargoMessage(platform?: string): string;

export function hasCargo(
  env: Record<string, string | undefined>,
  options?: HasCargoOptions,
): boolean;

export function runTauri(
  args: string[],
  options?: RunTauriOptions,
): Promise<number>;
