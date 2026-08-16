import fs from "node:fs";
import path from "node:path";

const normalizePath = (filepath: string) => {
  return path.posix
    .normalize(filepath.split(path.sep).join("/"))
    .replace(/^\//, "");
};

const gitignoreExcludePatterns = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".cache",
  ".DS_Store",
  ".env*",
  "*.log",
];

const getIgnoreFilePatterns = (filename: string): string[] => {
  const ignorePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(ignorePath)) return [];
  return fs
    .readFileSync(ignorePath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
};

const getGitIgnorePatterns = (): string[] => getIgnoreFilePatterns(".gitignore");
const getAgentIgnorePatterns = (): string[] => getIgnoreFilePatterns(".agentignore");
const getWispIgnorePatterns = (): string[] => getIgnoreFilePatterns(".wispignore");
const getDotIgnorePatterns = (): string[] => getIgnoreFilePatterns(".ignore");

const parseGitignorePattern = (pattern: string) => {
  const negate = pattern.startsWith("!");
  const cleanPattern = negate ? pattern.slice(1) : pattern;
  const isDirectory = cleanPattern.endsWith("/");
  const directory = isDirectory ? cleanPattern.slice(0, -1) : cleanPattern;

  let starCount = 0;
  let wildcardStar = false;
  let doubleStar = false;

  for (let i = 0; i < directory.length; i++) {
    if (directory[i] === "*") {
      starCount++;
      if (i + 1 < directory.length && directory[i + 1] === "*") {
        doubleStar = true;
        i++;
      } else {
        wildcardStar = true;
      }
    }
  }

  return {
    negate,
    pattern: directory,
    isDirectory,
    wildcardStar,
    doubleStar,
    starCount,
  };
};

const doesMatchPattern = (
  norm: string,
  parsed: ReturnType<typeof parseGitignorePattern>,
): boolean => {
  const { pattern, isDirectory, wildcardStar, doubleStar, starCount } = parsed;

  if (pattern === "") return false;

  if (parsed.wildcardStar && starCount === 1 && !parsed.doubleStar) {
    const regexStr =
      "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, "(?:[^/]*)") + "$";
    const regex = new RegExp(regexStr);
    if (regex.test(norm)) return true;
  }

  if (doubleStar) {
    const regexStr =
      "^" +
      pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, "(.*)")
        .replace(/\*/g, "(?:[^/]*)") +
      "$";
    const regex = new RegExp(regexStr);
    if (regex.test(norm)) return true;
  }

  if (pattern.includes("/")) {
    const patternParts = pattern.split("/");

    if (patternParts.length === 1) {
      if (norm === pattern || norm.startsWith(pattern + "/")) return true;
    } else if (patternParts[0] === "") {
      if (norm.startsWith("/")) return true;
    } else if (patternParts[patternParts.length - 1] === "") {
      if (norm.endsWith("/")) return true;
    }
    return false;
  }

  if (norm === pattern || norm.startsWith(pattern + "/")) return true;
  return false;
};

const excluded = (filePath: string): boolean => {
  const norm = normalizePath(filePath);
  const segments = norm.split("/");
  const base = segments[segments.length - 1];

  const patterns = [
    ...gitignoreExcludePatterns,
    ...getGitIgnorePatterns(),
    ...getAgentIgnorePatterns(),
    ...getWispIgnorePatterns(),
    ...getDotIgnorePatterns(),
  ];

  let isExcluded = false;

  for (const pattern of patterns) {
    const parsed = parseGitignorePattern(pattern);

    if (parsed.isDirectory) {
      if (norm === parsed.pattern || norm.startsWith(parsed.pattern + "/")) {
        isExcluded = !parsed.negate;
      }
      continue;
    }

    if (parsed.pattern === "*.log" && base?.endsWith(".log")) {
      isExcluded = !parsed.negate;
      continue;
    }
    if (parsed.pattern === ".env*" && base?.startsWith(".env")) {
      isExcluded = !parsed.negate;
      continue;
    }

    if (doesMatchPattern(norm, parsed)) {
      isExcluded = !parsed.negate;
    }
  }

  return isExcluded;
};

export const isExcluded = (filePath: string): boolean => excluded(filePath);

const checkNotExcluded = (filePath: string, operation: string): void => {
  if (excluded(filePath))
    throw new Error(`${operation} of excluded file ${filePath} is not allowed`);
};

const resolveSafe = (filePath: string): string => {
  const abs = path.resolve(process.cwd(), filePath);
  const root = fs.realpathSync(process.cwd());
  let realAbs: string;
  if (fs.existsSync(abs)) {
    realAbs = fs.realpathSync(abs);
  } else {
    let ancestor = path.dirname(abs);
    while (ancestor !== path.dirname(ancestor) && !fs.existsSync(ancestor)) {
      ancestor = path.dirname(ancestor);
    }
    const realAncestor = fs.existsSync(ancestor)
      ? fs.realpathSync(ancestor)
      : root;
    realAbs = path.join(realAncestor, path.relative(ancestor, abs));
  }

  const relCheck = path.relative(root, realAbs);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return abs;
};

const assertRealPathIsInWorkspace = (
  targetPath: string,
  filePath: string,
): string => {
  const root = fs.realpathSync(process.cwd());
  const realPath = fs.realpathSync(targetPath);
  const relative = path.relative(root, realPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escapes workspace through symlink: " + filePath);
  }

  return realPath;
};

export const getFileContent = (filepath: string) => {
  checkNotExcluded(filepath, "read_file");
  const abs = resolveSafe(filepath);

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
    throw new Error("File does not exist or is not a file");

  const realPath = assertRealPathIsInWorkspace(abs, filepath);
  const text = fs.readFileSync(realPath, "utf-8");

  return { path: normalizePath(filepath), content: text };
};

export const writeFile = (filePath: string, content: string) => {
  checkNotExcluded(filePath, "write_file");
  const abs = resolveSafe(filePath);

  const parentDirectory = path.dirname(abs);
  fs.mkdirSync(parentDirectory, { recursive: true });
  assertRealPathIsInWorkspace(parentDirectory, filePath);
  fs.writeFileSync(abs, content, { encoding: "utf-8" });

  return {
    path: normalizePath(filePath),
    created: true as const,
    content,
  } as const;
};

export const createFile = (filePath: string) => {
  return writeFile(filePath, "");
};

export const editFile = (filePath: string, oldStr: string, newStr: string) => {
  checkNotExcluded(filePath, "edit_file");
  const abs = resolveSafe(filePath);

  if (!fs.existsSync(abs)) throw new Error("File does not exist");

  const realPath = assertRealPathIsInWorkspace(abs, filePath);
  const text = fs.readFileSync(realPath, "utf-8");
  const normalizedText = text.replace(/\r\n/g, "\n");
  const normalizedOldStr = oldStr.replace(/\r\n/g, "\n");

  const exactIndex = text.indexOf(oldStr);
  const normalizedIndex =
    exactIndex === -1 ? normalizedText.indexOf(normalizedOldStr) : -1;
  const oldIndex = exactIndex !== -1 ? exactIndex : normalizedIndex;

  if (oldIndex === -1) {
    throw new Error(
      `old string not found in ${filePath}; the file may have changed. Re-read the file and retry with an exact current snippet.`,
    );
  }

  const match = exactIndex !== -1 ? oldStr : normalizedOldStr;
  const occurrences = (exactIndex !== -1 ? text : normalizedText).split(match).length - 1;
  if (occurrences > 1) {
    throw new Error(
      `old string occurs ${occurrences} times in ${filePath}; provide more surrounding context to disambiguate`,
    );
  }

  const sourceText = exactIndex !== -1 ? text : normalizedText;
  const newText =
    sourceText.slice(0, oldIndex) + newStr + sourceText.slice(oldIndex + match.length);

  assertRealPathIsInWorkspace(abs, filePath);
  fs.writeFileSync(realPath, newText, "utf-8");

  return { path: normalizePath(filePath), content: newText } as const;
};

export const deleteFile = (filePath: string) => {
  checkNotExcluded(filePath, "delete_file");
  const abs = resolveSafe(filePath);

  if (!fs.existsSync(abs)) throw new Error("File does not exist");

  const realPath = assertRealPathIsInWorkspace(abs, filePath);
  fs.unlinkSync(realPath);

  return { path: normalizePath(filePath), deleted: true } as const;
};

export const listFiles = (rel: string, recursive = false, pattern?: string) => {
  checkNotExcluded(rel, "list_files");
  const abs = resolveSafe(rel);
  if (!fs.existsSync(abs)) throw new Error(`list_files: not found: ${rel}`);
  if (!fs.statSync(abs).isDirectory())
    throw new Error(`list_files: not a directory: ${rel}`);

  assertRealPathIsInWorkspace(abs, rel);

  const globToRegex = (pat: string): RegExp => {
    let source = "";
    for (let i = 0; i < pat.length; i++) {
      const char = pat[i];
      if (char === "*") {
        if (pat[i + 1] === "*") {
          source += ".*";
          i++;
        } else {
          source += "[^/]*";
        }
      } else if (char === "?") {
        source += "[^/]";
      } else {
        source += char?.replace(/[.+^${}()|[\]\\]/g, "\\$&") ?? "";
      }
    }
    return new RegExp(`^${source}$`, "i");
  };

  const matcher = pattern && pattern !== "**/*" ? globToRegex(pattern) : null;
  const files: string[] = [];

  const visit = (directory: string, prefix: string) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      const relp = path.relative(process.cwd(), full);

      if (excluded(relp)) continue;
      if (entry.isDirectory()) {
        if (!matcher) {
          files.push(`${prefix}${entry.name}/`);
        }
        if (recursive) visit(full, `${prefix}${entry.name}/`);
      } else {
        const itemPath = `${prefix}${entry.name}`;
        if (!matcher || matcher.test(entry.name) || matcher.test(itemPath)) {
          files.push(itemPath);
        }
      }
    }
  };

  visit(abs, "");

  return { path: normalizePath(rel), files, pattern: pattern ?? undefined } as const;
};

export const searchFiles = (
  rootRel: string,
  globPattern: string,
  query: string,
  recursive = true,
) => {
  if (query.length === 0)
    throw new Error("search_files: query cannot be empty");

  checkNotExcluded(rootRel, "search_files");
  const rootAbs = resolveSafe(rootRel);
  if (!fs.existsSync(rootAbs))
    throw new Error(`search_files: not found: ${rootRel}`);
  if (!fs.statSync(rootAbs).isDirectory())
    throw new Error(`search_files: not a directory: ${rootRel}`);

  assertRealPathIsInWorkspace(rootAbs, rootRel);

  const globToRegex = (pattern: string): RegExp => {
    let source = "";
    for (let index = 0; index < pattern.length; index++) {
      const char = pattern[index];
      if (char === "*") {
        if (pattern[index + 1] === "*") {
          source += ".*";
          index++;
        } else {
          source += "[^/]*";
        }
      } else if (char === "?") {
        source += "[^/]";
      } else {
        source += char?.replace(/[.+^${}()|[\\]\\]/g, "\\$&") ?? "";
      }
    }
    return new RegExp(`^${source}$`, "i");
  };

  const matchesGlob =
    globPattern === "**/*" ? /^.*$/i : globToRegex(globPattern);
  const results: string[] = [];

  const walk = (directory: string) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      const relPath = normalizePath(path.relative(process.cwd(), full));
      if (excluded(relPath)) continue;

      if (entry.isDirectory()) {
        if (recursive) walk(full);
        continue;
      }

      const searchPath = normalizePath(path.relative(rootAbs, full));
      if (!matchesGlob.test(searchPath)) continue;

      let content: string;
      try {
        content = fs.readFileSync(full, "utf-8");
      } catch {
        continue;
      }
      if (content.includes("\0")) continue;

      const lines = content.split("\n");
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex] ?? "";
        let offset = line.indexOf(query);
        while (offset !== -1) {
          results.push(`${relPath}:${lineIndex + 1}:${offset + 1}: ${line}`);
          offset = line.indexOf(query, offset + query.length);
        }
      }
    }
  };

  walk(rootAbs);
  return results;
};
