export interface AppConfig {
  watchPaths: string[];
  defaultCwd?: string;
  scanLooseMode: boolean;
}

export function createDefaultConfig(): AppConfig {
  return {
    watchPaths: [],
    scanLooseMode: false,
  };
}

export function needsOnboarding(config: AppConfig): boolean {
  return config.watchPaths.length === 0;
}
