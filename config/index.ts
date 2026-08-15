import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type WispConfig = {
  model: string;
  openRouterApiKey?: string;
  tavilyApiKey?: string;
};

export const DEFAULT_CONFIG: WispConfig = {
  model: "nvidia/nemotron-3-super-120b-a12b:free",
};

export function getConfigDir(): string {
  if (process.env.WISP_CONFIG_DIR) {
    return process.env.WISP_CONFIG_DIR;
  }

  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, "wisp");
  }

  return join(homedir(), ".wisp");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function readConfig(): WispConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    writeConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<WispConfig>;

    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    console.error(
      `[wisp] Failed to parse config at ${configPath}. Falling back to defaults.`,
    );
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: WispConfig): void {
  const dir = getConfigDir();
  const configPath = getConfigPath();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function updateConfig(updates: Partial<WispConfig>): WispConfig {
  const current = readConfig();
  const updated = { ...current, ...updates };
  writeConfig(updated);
  return updated;
}
