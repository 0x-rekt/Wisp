import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { formatApprovalPreview } from "../tools/format-approval";
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

describe("approval behavior", () => {
  it("produces a diff preview for edit_file when the old string exists", () => {
    writeWorkspaceFile(ws, "app.ts", "const a = 1;");
    const preview = formatApprovalPreview("edit_file", {
      filepath: "app.ts",
      oldStr: "const a = 1;",
      newStr: "const a = 2;",
    });
    expect(preview.kind).toBe("diff");
    if (preview.kind === "diff") {
      expect(preview.header).toBe("edit_file: app.ts");
      expect(preview.diff).toContain("- const a = 1;");
      expect(preview.diff).toContain("+ const a = 2;");
      expect(preview.filetype).toBe("typescript");
      expect(preview.prompt).toBe("apply this change?");
    }
  });

  it("produces a text preview for edit_file when the file is missing", () => {
    const preview = formatApprovalPreview("edit_file", {
      filepath: "nope.ts",
      oldStr: "a",
      newStr: "b",
    });
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") {
      expect(preview.text).toContain("file not found");
    }
  });

  it("produces a text preview for edit_file when the old string is missing", () => {
    writeWorkspaceFile(ws, "app.ts", "actual content");
    const preview = formatApprovalPreview("edit_file", {
      filepath: "app.ts",
      oldStr: "missing",
      newStr: "b",
    });
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") {
      expect(preview.text).toContain("old string not found");
    }
  });

  it("produces a diff preview for a new write_file", () => {
    const preview = formatApprovalPreview("write_file", {
      filepath: "new.ts",
      content: "export const x = 1;",
    });
    expect(preview.kind).toBe("diff");
    if (preview.kind === "diff") {
      expect(preview.header).toContain("write_file: new.ts");
      expect(preview.header).toContain("[new file]");
      expect(preview.diff).toContain("+ export const x = 1;");
    }
  });

  it("produces a diff preview for an overwriting write_file", () => {
    writeWorkspaceFile(ws, "a.txt", "old text");
    const preview = formatApprovalPreview("write_file", {
      filepath: "a.txt",
      content: "new text",
    });
    expect(preview.kind).toBe("diff");
    if (preview.kind === "diff") {
      expect(preview.header).not.toContain("[new file]");
      expect(preview.diff).toContain("- old text");
      expect(preview.diff).toContain("+ new text");
    }
  });

  it("produces a no-changes text preview for write_file with identical content", () => {
    writeWorkspaceFile(ws, "a.txt", "same");
    const preview = formatApprovalPreview("write_file", {
      filepath: "a.txt",
      content: "same",
    });
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") {
      expect(preview.text).toContain("no changes");
    }
  });

  it("produces a text preview for delete_file", () => {
    const preview = formatApprovalPreview("delete_file", { filepath: "a.txt" });
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") {
      expect(preview.text).toContain("delete_file: a.txt");
      expect(preview.prompt).toBe("apply this change?");
    }
  });

  it("produces a command preview for run_command", () => {
    const preview = formatApprovalPreview("run_command", {
      command: "ls -la",
    });
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") {
      expect(preview.text).toBe("$ ls -la");
      expect(preview.prompt).toBe("run this command?");
    }
  });

  it("falls back to JSON text for unknown tools", () => {
    const preview = formatApprovalPreview("some_other_tool", { foo: "bar" });
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") {
      expect(preview.text).toContain("some_other_tool");
      expect(preview.text).toContain("bar");
    }
  });
});
