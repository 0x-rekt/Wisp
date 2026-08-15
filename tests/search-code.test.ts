import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { searchFiles } from "../tools/files";
import { makeWorkspace, restoreCwd, withCwd, writeWorkspaceFile } from "./helpers";

let ws = "";

beforeEach(() => {
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
  ws = makeWorkspace();
  withCwd(ws);
  writeWorkspaceFile(ws, "src/app.ts", "const greeting = 'hello';\nexport const app = 1;");
  writeWorkspaceFile(ws, "src/util.ts", "export function hello() { return 'hi'; }");
  writeWorkspaceFile(ws, "src/nested/deep.ts", "const greeting = 'hello deep';\n");
  writeWorkspaceFile(ws, "README.md", "hello there");
});

afterAll(() => {
  restoreCwd();
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
});

describe("search_code", () => {
  it("throws on an empty query", () => {
    expect(() => searchFiles(".", "**/*", "", true)).toThrow(
      /query cannot be empty/,
    );
  });

  it("returns matching lines with path, line, and offset", () => {
    const results = searchFiles(".", "**/*", "hello", true);
    const app = results.find((r) => r.includes("src/app.ts"));
    expect(app).toContain("src/app.ts:1:19: const greeting = 'hello';");
    expect(results.some((r) => r.includes("README.md"))).toBe(true);
    expect(results.some((r) => r.includes("src/nested/deep.ts"))).toBe(true);
  });

  it("finds multiple occurrences on the same line", () => {
    writeWorkspaceFile(ws, "multi.txt", "dup dup dup");
    const results = searchFiles(".", "**/*", "dup", true);
    const multi = results.filter((r) => r.includes("multi.txt"));
    expect(multi.length).toBe(3);
  });

  it("respects the glob pattern", () => {
    const ts = searchFiles(".", "**/*.ts", "hello", true);
    expect(ts.some((r) => r.includes("src/app.ts"))).toBe(true);
    expect(ts.some((r) => r.includes("README.md"))).toBe(false);
  });

  it("honours non-recursive search", () => {
    const results = searchFiles(".", "**/*", "deep", false);
    expect(results.some((r) => r.includes("src/nested/deep.ts"))).toBe(false);
  });

  it("honours a scoped root directory", () => {
    const results = searchFiles("src", "**/*", "hello", true);
    expect(results.some((r) => r.startsWith("src/"))).toBe(true);
    expect(results.some((r) => r.includes("README.md"))).toBe(false);
  });

  it("returns empty results when there are no matches", () => {
    const results = searchFiles(".", "**/*", "zzz-not-here", true);
    expect(results).toEqual([]);
  });

  it("does not include files matched by the glob when they are excluded", () => {
    writeWorkspaceFile(ws, "node_modules/pkg.js", "hello from node_modules");
    const results = searchFiles(".", "**/*", "node_modules", true);
    expect(results.some((r) => r.includes("node_modules/pkg.js"))).toBe(false);
  });
});
