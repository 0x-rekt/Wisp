import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  deleteFile,
  editFile,
  getFileContent,
  writeFile,
} from "../tools/files";
import { makeWorkspace, restoreCwd, withCwd } from "./helpers";

let ws = "";

beforeAll(() => {
  ws = makeWorkspace();
});

afterAll(() => {
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
});

describe("path traversal and symlink protection", () => {
  it("allows reading a file inside the workspace", () => {
    withCwd(ws);
    const rel = "nested/deep/file.txt";
    fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
    fs.writeFileSync(path.join(ws, rel), "hello world", "utf-8");
    const result = getFileContent(rel);
    expect(result.content).toBe("hello world");
    expect(result.path).toBe(rel);
  });

  it("rejects traversal with .. escaping the workspace", () => {
    withCwd(ws);
    const outside = path.join(path.dirname(ws), "outside.txt");
    fs.writeFileSync(outside, "secret", "utf-8");
    expect(() => getFileContent("../outside.txt")).toThrow(
      /escapes workspace|File does not exist/,
    );
  });

  it("rejects absolute paths escaping the workspace", () => {
    withCwd(ws);
    const outside = path.join(path.dirname(ws), "abs.txt");
    fs.writeFileSync(outside, "secret", "utf-8");
    expect(() => getFileContent(outside)).toThrow(
      /escapes workspace|File does not exist/,
    );
  });

  it("rejects symlink that resolves outside the workspace", () => {
    withCwd(ws);
    const outside = path.join(path.dirname(ws), "target.txt");
    fs.writeFileSync(outside, "secret", "utf-8");
    const link = path.join(ws, "link.txt");
    fs.symlinkSync(outside, link);
    expect(() => getFileContent("link.txt")).toThrow(/symlink|escapes/);
  });

  it("rejects writing through a symlinked parent that escapes workspace", () => {
    withCwd(ws);
    const outsideDir = path.join(path.dirname(ws), "outside-dir");
    fs.mkdirSync(outsideDir, { recursive: true });
    const linkDir = path.join(ws, "vuln");
    fs.symlinkSync(outsideDir, linkDir);
    expect(() => writeFile("vuln/x.txt", "data")).toThrow(/symlink|escapes/);
  });

  it("rejects editing a symlink that escapes the workspace", () => {
    withCwd(ws);
    const outside = path.join(path.dirname(ws), "edit-target.txt");
    fs.writeFileSync(outside, "abc", "utf-8");
    const link = path.join(ws, "edit-link.txt");
    fs.symlinkSync(outside, link);
    expect(() => editFile("edit-link.txt", "a", "z")).toThrow(/symlink|escapes/);
  });

  it("rejects deleting a symlink that escapes the workspace", () => {
    withCwd(ws);
    const outside = path.join(path.dirname(ws), "delete-target.txt");
    fs.writeFileSync(outside, "abc", "utf-8");
    const link = path.join(ws, "delete-link.txt");
    fs.symlinkSync(outside, link);
    expect(() => deleteFile("delete-link.txt")).toThrow(/symlink|escapes/);
  });
});
