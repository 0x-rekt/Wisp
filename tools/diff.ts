const CONTEXT_LINES = 3;

type DiffOp = { type: "equal" | "remove" | "add"; line: string };

const computeDiffOps = (oldLines: string[], newLines: string[]): DiffOp[] => {
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: "equal", line: oldLines[i - 1]! });
      i--;
      j--;
    } else if (
      j > 0 &&
      (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))
    ) {
      ops.push({ type: "add", line: newLines[j - 1]! });
      j--;
    } else {
      ops.push({ type: "remove", line: oldLines[i - 1]! });
      i--;
    }
  }

  ops.reverse();
  return ops;
};

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

const buildHunks = (ops: DiffOp[]): Hunk[] => {
  type ChangeRange = { start: number; end: number };
  const changes: ChangeRange[] = [];

  for (let i = 0; i < ops.length; i++) {
    if (ops[i]!.type !== "equal") {
      const start = Math.max(0, i - CONTEXT_LINES);
      const end = Math.min(ops.length - 1, i + CONTEXT_LINES);

      if (changes.length > 0 && start <= changes[changes.length - 1]!.end + 1) {
        changes[changes.length - 1]!.end = end;
      } else {
        changes.push({ start, end });
      }
    }
  }

  const hunks: Hunk[] = [];

  for (const range of changes) {
    let oldLine = 1;
    let newLine = 1;

    for (let i = 0; i < range.start; i++) {
      const op = ops[i]!;
      if (op.type === "equal" || op.type === "remove") oldLine++;
      if (op.type === "equal" || op.type === "add") newLine++;
    }

    const hunk: Hunk = {
      oldStart: oldLine,
      oldCount: 0,
      newStart: newLine,
      newCount: 0,
      lines: [],
    };

    for (let i = range.start; i <= range.end; i++) {
      const op = ops[i]!;
      switch (op.type) {
        case "equal":
          hunk.lines.push(` ${op.line}`);
          hunk.oldCount++;
          hunk.newCount++;
          break;
        case "remove":
          hunk.lines.push(`- ${op.line}`);
          hunk.oldCount++;
          break;
        case "add":
          hunk.lines.push(`+ ${op.line}`);
          hunk.newCount++;
          break;
      }
    }

    hunks.push(hunk);
  }

  return hunks;
};

export const createDiff = (
  filePath: string,
  oldContent: string,
  newContent: string,
): string => {
  if (oldContent === newContent) return "";

  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const ops = computeDiffOps(oldLines, newLines);
  const hunks = buildHunks(ops);

  if (hunks.length === 0) return "";

  const out: string[] = [];
  out.push(`--- a/${filePath}`);
  out.push(`+++ b/${filePath}`);

  for (const hunk of hunks) {
    out.push(
      `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
    );
    out.push(...hunk.lines);
  }

  return out.join("\n");
};
