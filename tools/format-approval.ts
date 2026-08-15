import fs from "node:fs";
import path from "node:path";
import { createDiff } from "./diff";

export type ApprovalPreview =
  | {
      kind: "diff";

      header: string;

      diff: string;

      filetype: string;

      prompt: string;
    }
  | {
      kind: "text";

      text: string;

      prompt: string;
    };

const tryReadFile = (filepath: string): string | null => {
  try {
    const abs = path.resolve(process.cwd(), filepath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    return fs.readFileSync(abs, "utf-8");
  } catch {
    return null;
  }
};

const filetypeFromPath = (filepath: string): string => {
  const ext = path.extname(filepath).replace(/^\./, "");
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
  };
  return map[ext] ?? ext;
};

const formatEditFile = (args: {
  filepath: string;
  oldStr: string;
  newStr: string;
}): ApprovalPreview => {
  const existing = tryReadFile(args.filepath);

  if (existing === null) {
    return {
      kind: "text",
      text: `edit_file: ${args.filepath}\n\n  (file not found — edit will fail)`,
      prompt: "apply this change?",
    };
  }

  const idx = existing.indexOf(args.oldStr);
  if (idx === -1) {
    return {
      kind: "text",
      text: `edit_file: ${args.filepath}\n\n  (old string not found — edit will fail)`,
      prompt: "apply this change?",
    };
  }

  const proposed =
    existing.slice(0, idx) +
    args.newStr +
    existing.slice(idx + args.oldStr.length);

  const diff = createDiff(args.filepath, existing, proposed);

  return {
    kind: "diff",
    header: `edit_file: ${args.filepath}`,
    diff,
    filetype: filetypeFromPath(args.filepath),
    prompt: "apply this change?",
  };
};

const formatWriteFile = (args: {
  filepath: string;
  content: string;
}): ApprovalPreview => {
  const existing = tryReadFile(args.filepath);
  const isNew = existing === null;
  const tag = isNew ? " [new file]" : "";
  const diff = createDiff(args.filepath, existing ?? "", args.content);

  if (!diff) {
    return {
      kind: "text",
      text: `write_file: ${args.filepath}${tag}\n\n  (no changes)`,
      prompt: "apply this change?",
    };
  }

  return {
    kind: "diff",
    header: `write_file: ${args.filepath}${tag}`,
    diff,
    filetype: filetypeFromPath(args.filepath),
    prompt: "apply this change?",
  };
};

const formatDeleteFile = (args: { filepath: string }): ApprovalPreview => {
  return {
    kind: "text",
    text: `delete_file: ${args.filepath}`,
    prompt: "apply this change?",
  };
};

const formatRunCommand = (args: { command: string }): ApprovalPreview => {
  return {
    kind: "text",
    text: `$ ${args.command}`,
    prompt: "run this command?",
  };
};

export const formatApprovalPreview = (
  toolName: string,
  toolArgs: unknown,
): ApprovalPreview => {
  const args = toolArgs as Record<string, unknown>;

  switch (toolName) {
    case "edit_file":
      return formatEditFile(args as Parameters<typeof formatEditFile>[0]);

    case "write_file":
      return formatWriteFile(args as Parameters<typeof formatWriteFile>[0]);

    case "delete_file":
      return formatDeleteFile(args as Parameters<typeof formatDeleteFile>[0]);

    case "run_command":
      return formatRunCommand(args as Parameters<typeof formatRunCommand>[0]);

    default:
      return {
        kind: "text",
        text: `${toolName}\n${JSON.stringify(args, null, 2)}`,
        prompt: "approve?",
      };
  }
};
