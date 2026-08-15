import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createFile, deleteFile, writeFile } from "../tools/files";
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

describe("write_file", () => {
  it("creates a new file with content", () => {
    const result = writeFile("new.txt", "content here");
    expect(result.path).toBe("new.txt");
    expect(result.created).toBe(true);
    expect(result.content).toBe("content here");
    expect(fs.readFileSync(path.join(ws, "new.txt"), "utf-8")).toBe(
      "content here",
    );
  });

  it("creates intermediate directories", () => {
    writeFile("a/b/c/deep.txt", "deep content");
    expect(
      fs.readFileSync(path.join(ws, "a/b/c/deep.txt"), "utf-8"),
    ).toBe("deep content");
  });

  it("overwrites an existing file", () => {
    writeWorkspaceFile(ws, "existing.txt", "old");
    const result = writeFile("existing.txt", "new content");
    expect(result.created).toBe(true);
    expect(fs.readFileSync(path.join(ws, "existing.txt"), "utf-8")).toBe(
      "new content",
    );
  });

  it("writes empty content", () => {
    writeFile("empty.txt", "");
    expect(fs.readFileSync(path.join(ws, "empty.txt"), "utf-8")).toBe("");
  });
});

describe("create_file", () => {
  it("creates an empty file", () => {
    const result = createFile("blank.txt");
    expect(result.created).toBe(true);
    expect(result.content).toBe("");
    expect(fs.existsSync(path.join(ws, "blank.txt"))).toBe(true);
  });
});

describe("delete_file", () => {
  it("deletes an existing file", () => {
    writeWorkspaceFile(ws, "gone.txt", "bye");
    const result = deleteFile("gone.txt");
    expect(result.path).toBe("gone.txt");
    expect(result.deleted).toBe(true);
    expect(fs.existsSync(path.join(ws, "gone.txt"))).toBe(false);
  });

  it("throws when the file does not exist", () => {
    expect(() => deleteFile("nope.txt")).toThrow(/File does not exist/);
  });
});
