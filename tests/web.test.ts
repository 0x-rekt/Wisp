import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readConfig, writeConfig, DEFAULT_CONFIG } from "../config";

let configDir = "";
let capturedKeys: string[] = [];
let searchImpl: ((query: string, opts: unknown) => Promise<unknown>) | null = null;

mock.module("@tavily/core", () => {
  return {
    tavily: (opts: { apiKey: string }) => {
      capturedKeys.push(opts.apiKey);
      return {
        search: async (query: string, searchOpts: Record<string, unknown>) => {
          if (searchImpl) return searchImpl(query, searchOpts);
          return {
            results: [
              {
                title: `result for ${query}`,
                url: `https://example.com/${query}`,
                content: "some content",
              },
            ],
          };
        },
      };
    },
  };
});

const { webSearch } = await import("../tools/web");

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-web-"));
  process.env.WISP_CONFIG_DIR = configDir;
  delete process.env.TAVILY_API_KEY;
  capturedKeys = [];
  searchImpl = null;
});

afterEach(() => {
  delete process.env.WISP_CONFIG_DIR;
  delete process.env.TAVILY_API_KEY;
  if (configDir) fs.rmSync(configDir, { recursive: true, force: true });
});

describe("Tavily config loading", () => {
  it("throws when no API key is configured", async () => {
    await expect(webSearch("hello")).rejects.toThrow(
      /TAVILY_API_KEY is not configured/,
    );
  });

  it("uses the API key from config", async () => {
    writeConfig({ ...DEFAULT_CONFIG, tavilyApiKey: "config-key" });
    await webSearch("hello");
    expect(capturedKeys).toEqual(["config-key"]);
  });

  it("uses the TAVILY_API_KEY env var when config has no key", async () => {
    process.env.TAVILY_API_KEY = "env-key";
    await webSearch("hello");
    expect(capturedKeys).toEqual(["env-key"]);
  });

  it("prefers the config key over the env var", async () => {
    writeConfig({ ...DEFAULT_CONFIG, tavilyApiKey: "config-key" });
    process.env.TAVILY_API_KEY = "env-key";
    await webSearch("hello");
    expect(capturedKeys).toEqual(["config-key"]);
  });

  it("returns mapped results from Tavily", async () => {
    writeConfig({ ...DEFAULT_CONFIG, tavilyApiKey: "config-key" });
    const response = await webSearch("hello");
    expect(response.query).toBe("hello");
    expect(response.results[0]).toEqual({
      title: "result for hello",
      url: "https://example.com/hello",
      content: "some content",
    });
  });

  it("throws on an empty query after trimming", async () => {
    writeConfig({ ...DEFAULT_CONFIG, tavilyApiKey: "config-key" });
    await expect(webSearch("   ")).rejects.toThrow(/query cannot be empty/);
  });

  it("throws when the query is too long", async () => {
    writeConfig({ ...DEFAULT_CONFIG, tavilyApiKey: "config-key" });
    await expect(webSearch("x".repeat(501))).rejects.toThrow(/exceeds 500/);
  });

  it("throws when maxResults is out of range", async () => {
    writeConfig({ ...DEFAULT_CONFIG, tavilyApiKey: "config-key" });
    await expect(webSearch("hello", 0)).rejects.toThrow(/maxResults/);
    await expect(webSearch("hello", 11)).rejects.toThrow(/maxResults/);
    await expect(webSearch("hello", 2.5)).rejects.toThrow(/maxResults/);
  });
});
