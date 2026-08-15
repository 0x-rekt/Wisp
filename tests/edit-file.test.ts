import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { editFile, getFileContent } from "../tools/files";
import { makeWorkspace, restoreCwd, withCwd, writeWorkspaceFile } from "./helpers";

let ws = "";

beforeEach(() => {
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
  ws = makeWorkspace();
  withCwd(ws);
});

afterAll(() => {
  restoreCwd();
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
});

describe("edit_file ambiguity handling", () => {
  it("throws when the old string is not found", () => {
    writeWorkspaceFile(ws, "a.txt", "hello world");
    expect(() => editFile("a.txt", "missing", "replacement")).toThrow(
      /old string not found/,
    );
  });

  it("throws when the old string occurs multiple times", () => {
    writeWorkspaceFile(ws, "a.txt", "foo foo foo");
    expect(() => editFile("a.txt", "foo", "bar")).toThrow(
      /occurs 3 times|more surrounding context|disambiguate/,
    );
  });

  it("throws on an ambiguous occurrence count of 2", () => {
    writeWorkspaceFile(ws, "a.txt", "foo and foo");
    expect(() => editFile("a.txt", "foo", "bar")).toThrow(/disambiguate/);
  });

  it("replaces a unique old string", () => {
    writeWorkspaceFile(ws, "a.txt", "alpha beta");
    const result = editFile("a.txt", "beta", "omega");
    expect(result.content).toBe("alpha omega");
    expect(getFileContent("a.txt").content).toBe("alpha omega");
  });

  it("does not modify the file when the old string is ambiguous", () => {
    writeWorkspaceFile(ws, "a.txt", "foo foo");
    expect(() => editFile("a.txt", "foo", "bar")).toThrow();
    expect(getFileContent("a.txt").content).toBe("foo foo");
  });

  it("throws when the file does not exist", () => {
    expect(() => editFile("missing.txt", "a", "b")).toThrow(
      /File does not exist/,
    );
  });

  it("preserves surrounding content in multi-line edits", () => {
    writeWorkspaceFile(ws, "a.txt", "line1\nline2\nline3");
    const result = editFile("a.txt", "line2", "CHANGED");
    expect(result.content).toBe("line1\nCHANGED\nline3");
  });
});
