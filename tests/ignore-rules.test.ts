import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  deleteFile,
  editFile,
  getFileContent,
  listFiles,
  searchFiles,
  writeFile,
} from "../tools/files";
import { makeWorkspace, restoreCwd, withCwd, writeWorkspaceFile } from "./helpers";

let ws = "";

beforeEach(() => {
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
  ws = makeWorkspace();
  withCwd(ws);
  fs.writeFileSync(
    path.join(ws, ".gitignore"),
    ".env\n*.log\nlogs/\n",
    "utf-8",
  );
  writeWorkspaceFile(ws, "src/app.ts", "export const app = 1;");
  writeWorkspaceFile(ws, "src/lib.ts", "export const lib = 2;");
  writeWorkspaceFile(ws, "node_modules/pkg/index.js", "module.exports = 1;");
  writeWorkspaceFile(ws, ".env", "SECRET=abc");
  writeWorkspaceFile(ws, "logs/app.log", "2024-01-01 error");
  writeWorkspaceFile(ws, "dist/bundle.js", "console.log('bundle');");
});

afterAll(() => {
  restoreCwd();
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
});

describe("ignore rules", () => {
  it("blocks reading an excluded file (node_modules)", () => {
    expect(() => getFileContent("node_modules/pkg/index.js")).toThrow(
      /excluded file/,
    );
  });

  it("blocks reading an excluded .env file", () => {
    expect(() => getFileContent(".env")).toThrow(/excluded file/);
  });

  it("blocks reading an excluded dist file", () => {
    expect(() => getFileContent("dist/bundle.js")).toThrow(/excluded file/);
  });

  it("blocks writing to an excluded file", () => {
    expect(() => writeFile("node_modules/new.js", "x")).toThrow(/excluded file/);
  });

  it("blocks editing an excluded file", () => {
    writeWorkspaceFile(ws, "dist/bundle.js", "old content");
    expect(() => editFile("dist/bundle.js", "old", "new")).toThrow(
      /excluded file/,
    );
  });

  it("blocks deleting an excluded file", () => {
    expect(() => deleteFile(".env")).toThrow(/excluded file/);
  });

  it("reads an allowed file", () => {
    const result = getFileContent("src/app.ts");
    expect(result.content).toContain("export const app");
  });

  it("omits excluded files from listFiles", () => {
    const result = listFiles(".", true);
    expect(result.files).toContain("src/app.ts");
    expect(result.files).toContain("src/lib.ts");
    expect(result.files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(result.files.some((f) => f.includes("dist"))).toBe(false);
    expect(result.files.some((f) => f.includes("logs"))).toBe(false);
  });

  it("omits excluded files from searchFiles", () => {
    const results = searchFiles(".", "**/*", "export const", true);
    expect(results.some((r) => r.includes("src/app.ts"))).toBe(true);
    expect(results.some((r) => r.includes("node_modules"))).toBe(false);
  });

  it("honours custom patterns in .gitignore", () => {
    fs.writeFileSync(
      path.join(ws, ".gitignore"),
      "# comment\nsecret.txt\n*.log\n",
      "utf-8",
    );
    writeWorkspaceFile(ws, "secret.txt", "hidden");
    writeWorkspaceFile(ws, "notes.log", "log entry");
    expect(() => getFileContent("secret.txt")).toThrow(/excluded file/);
    expect(() => getFileContent("notes.log")).toThrow(/excluded file/);
  });

  it("honours negation with ! in .gitignore", () => {
    fs.writeFileSync(
      path.join(ws, ".gitignore"),
      "*.log\n!keep.log\n",
      "utf-8",
    );
    writeWorkspaceFile(ws, "drop.log", "drop me");
    writeWorkspaceFile(ws, "keep.log", "keep me");
    expect(() => getFileContent("drop.log")).toThrow(/excluded file/);
    expect(getFileContent("keep.log").content).toBe("keep me");
  });

  it("excludes a whole directory from .gitignore", () => {
    fs.writeFileSync(path.join(ws, ".gitignore"), "private/\n", "utf-8");
    writeWorkspaceFile(ws, "private/secret.txt", "hidden");
    writeWorkspaceFile(ws, "private/nested/deep.txt", "deep");
    expect(() => getFileContent("private/secret.txt")).toThrow(
      /excluded file/,
    );
    expect(() => getFileContent("private/nested/deep.txt")).toThrow(
      /excluded file/,
    );
  });

  it("does not exclude files outside the ignored directory", () => {
    fs.writeFileSync(path.join(ws, ".gitignore"), "private/\n", "utf-8");
    writeWorkspaceFile(ws, "private/secret.txt", "hidden");
    writeWorkspaceFile(ws, "public/open.txt", "open");
    expect(() => getFileContent("public/open.txt")).not.toThrow();
  });

  it("honours custom patterns in .agentignore", () => {
    fs.writeFileSync(
      path.join(ws, ".agentignore"),
      "# ignore\nprivate/\n",
      "utf-8",
    );
    writeWorkspaceFile(ws, "private/secret.txt", "hidden");
    expect(() => getFileContent("private/secret.txt")).toThrow(
      /excluded file/,
    );
  });

  it("allows directories listed in gitignoreExcludePatterns to be traversed", () => {
    const result = listFiles(".", true);
    expect(result.files.length).toBeGreaterThan(0);
  });
});
