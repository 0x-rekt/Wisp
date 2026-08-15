import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_CONFIG,
  getConfigDir,
  getConfigPath,
  readConfig,
  updateConfig,
  writeConfig,
} from "../config";

let configDir = "";
let originalWispConfigDir: string | undefined;

const setConfigDir = () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-config-"));
  process.env.WISP_CONFIG_DIR = configDir;
};

beforeEach(() => {
  originalWispConfigDir = process.env.WISP_CONFIG_DIR;
  setConfigDir();
});

afterEach(() => {
  if (originalWispConfigDir === undefined) {
    delete process.env.WISP_CONFIG_DIR;
  } else {
    process.env.WISP_CONFIG_DIR = originalWispConfigDir;
  }
  if (configDir) fs.rmSync(configDir, { recursive: true, force: true });
});

describe("config persistence", () => {
  it("writes config to the WISP_CONFIG_DIR path", () => {
    writeConfig({ ...DEFAULT_CONFIG, model: "model/a" });
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.model).toBe("model/a");
    expect(parsed).toEqual({ model: "model/a" });
  });

  it("getConfigDir honours WISP_CONFIG_DIR env var", () => {
    expect(getConfigDir()).toBe(configDir);
    expect(getConfigPath()).toBe(path.join(configDir, "config.json"));
  });

  it("readConfig returns defaults when no file exists and creates it", () => {
    expect(fs.existsSync(getConfigPath())).toBe(false);
    const config = readConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(fs.existsSync(getConfigPath())).toBe(true);
  });

  it("readConfig merges saved values over defaults", () => {
    writeConfig({ ...DEFAULT_CONFIG, model: "custom/model", openRouterApiKey: "sk-x" });
    const config = readConfig();
    expect(config.model).toBe("custom/model");
    expect(config.openRouterApiKey).toBe("sk-x");
    expect(config.tavilyApiKey).toBeUndefined();
  });

  it("readConfig falls back to defaults on invalid JSON", () => {
    fs.writeFileSync(getConfigPath(), "not valid json", "utf-8");
    const config = readConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("updateConfig persists partial updates", () => {
    const updated = updateConfig({ model: "updated/model" });
    expect(updated.model).toBe("updated/model");
    expect(readConfig().model).toBe("updated/model");
  });

  it("updateConfig keeps existing keys and adds new ones", () => {
    writeConfig({ ...DEFAULT_CONFIG, model: "base/model" });
    const updated = updateConfig({ tavilyApiKey: "tv-key" });
    expect(updated.model).toBe("base/model");
    expect(updated.tavilyApiKey).toBe("tv-key");
    expect(readConfig().tavilyApiKey).toBe("tv-key");
  });

  it("getConfigDir falls back when no env var is set", () => {
    delete process.env.WISP_CONFIG_DIR;
    delete process.env.XDG_CONFIG_HOME;
    expect(getConfigDir()).toBe(path.join(os.homedir(), ".wisp"));
  });

  it("getConfigDir uses XDG_CONFIG_HOME when set", () => {
    delete process.env.WISP_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-test";
    expect(getConfigDir()).toBe(path.join("/tmp/xdg-test", "wisp"));
  });
});
