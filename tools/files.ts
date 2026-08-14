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
];

const getAgentIgnorePatterns = (): string[] => {
  const agentIgnorePath = path.join(process.cwd(), ".agentignore");

  if (fs.existsSync(agentIgnorePath) === false) return [];

  return fs
    .readFileSync(agentIgnorePath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.startsWith("#") === false);
};

const getGitIgnorePatterns = (): string[] => {
  const gitignorePath = path.join(process.cwd(), ".gitignore");

  if (fs.existsSync(gitignorePath) === false) return [];

  return fs
    .readFileSync(gitignorePath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.startsWith("#") === false);
};

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
    if (regex.test(norm)) return !parsed.negate;
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
    if (regex.test(norm)) return !parsed.negate;
  }

  if (pattern.includes("/")) {
    const patternParts = pattern.split("/");
    const normParts = norm.split("/");

    if (patternParts.length === 1) {
      if (norm === pattern || norm.startsWith(pattern + "/"))
        return !parsed.negate;
    } else if (patternParts[0] === "") {
      if (norm.startsWith("/")) return !parsed.negate;
    } else if (patternParts[patternParts.length - 1] === "") {
      if (norm.endsWith("/")) return !parsed.negate;
    }
    return false;
  }

  if (norm === pattern || norm.startsWith(pattern + "/")) return !parsed.negate;
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
  ];

  for (const pattern of patterns) {
    const parsed = parseGitignorePattern(pattern);

    if (parsed.isDirectory) {
      if (norm === pattern || norm.startsWith(pattern + "/")) {
        if (!parsed.negate) return true;
      }
      continue;
    }

    if (parsed.pattern === "*.log" && base?.endsWith(".log")) {
      if (!parsed.negate) return true;
    }
    if (parsed.pattern === ".env*" && base?.startsWith(".env")) {
      if (!parsed.negate) return true;
    }

    if (doesMatchPattern(norm, parsed)) {
      if (!parsed.negate) return true;
    }
  }

  return false;
};

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

  if (fs.existsSync(parentDirectory) === false) {
    throw new Error("Parent directory does not exist");
  }
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

  const oldIndex = text.indexOf(oldStr);
  if (oldIndex === -1) throw new Error(`old string not found in ${filePath}`);

  const newText =
    text.slice(0, oldIndex) + newStr + text.slice(oldIndex + oldStr.length);

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

export const listFiles = (rel: string, recursive = false) => {
  checkNotExcluded(rel, "list_files");
  const abs = resolveSafe(rel);
  if (!fs.existsSync(abs)) throw new Error(`list_files: not found: ${rel}`);
  if (!fs.statSync(abs).isDirectory())
    throw new Error(`list_files: not a directory: ${rel}`);

  assertRealPathIsInWorkspace(abs, rel);

  const files: string[] = [];

  const visit = (directory: string, prefix: string) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      const relp = path.relative(process.cwd(), full);

      if (excluded(relp)) continue;
      if (entry.isDirectory()) {
        files.push(`${prefix}${entry.name}/`);
        if (recursive) visit(full, `${prefix}${entry.name}/`);
      } else {
        files.push(`${prefix}${entry.name}`);
      }
    }
  };

  visit(abs, "");

  return { path: normalizePath(rel), files } as const;
};
