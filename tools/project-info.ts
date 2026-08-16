import fs from "node:fs";
import path from "node:path";

export type PackageManager = "bun" | "npm" | "yarn" | "pnpm" | "none";
export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "other";

export type ProjectInfo = {
  /** The package manager detected from lock files. */
  packageManager: PackageManager;
  /** Scripts defined in package.json (empty object when absent). */
  scripts: Record<string, string>;
  /** The best inferred command to run tests, or null if unknown. */
  testCommand: string | null;
  /** The best inferred command to type-check / build, or null if unknown. */
  buildCommand: string | null;
  /** The best inferred command to lint, or null if unknown. */
  lintCommand: string | null;
  /** Primary language detected from config files. */
  language: Language;
  /** Relevant config files found in the workspace root. */
  configFiles: string[];
  /** Human-readable suggestions the agent should act on. */
  hints: string[];
};

const cwd = () => process.cwd();

const exists = (rel: string) => fs.existsSync(path.join(cwd(), rel));

const readJson = (rel: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd(), rel), "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/** Pick the first candidate script name found in a package.json scripts map. */
const pickScript = (
  scripts: Record<string, string>,
  candidates: string[],
): string | null => {
  for (const name of candidates) {
    if (Object.prototype.hasOwnProperty.call(scripts, name)) return name;
  }
  return null;
};

/**
 * Inspect the current workspace root and return structured information about
 * how to build, test, and lint the project.
 *
 * This is intentionally synchronous and cheap — it only reads a small number
 * of well-known config files; it does not walk the directory tree.
 */
export const getProjectInfo = (): ProjectInfo => {
  const configFiles: string[] = [];
  const hints: string[] = [];

  // ── Package manager detection ──────────────────────────────────────────
  let packageManager: PackageManager = "none";
  if (exists("bun.lock") || exists("bun.lockb")) {
    packageManager = "bun";
    configFiles.push("bun.lock");
  } else if (exists("pnpm-lock.yaml")) {
    packageManager = "pnpm";
    configFiles.push("pnpm-lock.yaml");
  } else if (exists("yarn.lock")) {
    packageManager = "yarn";
    configFiles.push("yarn.lock");
  } else if (exists("package-lock.json")) {
    packageManager = "npm";
    configFiles.push("package-lock.json");
  }

  // ── package.json scripts ───────────────────────────────────────────────
  const pkg = readJson("package.json");
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
  if (pkg) configFiles.push("package.json");

  // ── Language detection ─────────────────────────────────────────────────
  let language: Language = "other";

  const hasTsConfig = exists("tsconfig.json");
  if (hasTsConfig) {
    configFiles.push("tsconfig.json");
    language = "typescript";
  } else if (pkg) {
    language = "javascript";
  }

  if (exists("pyproject.toml")) {
    configFiles.push("pyproject.toml");
    language = "python";
  } else if (exists("setup.py")) {
    configFiles.push("setup.py");
    language = "python";
  } else if (exists("pytest.ini")) {
    configFiles.push("pytest.ini");
    language = "python";
  }

  if (exists("Cargo.toml")) {
    configFiles.push("Cargo.toml");
    language = "rust";
  }

  if (exists("go.mod")) {
    configFiles.push("go.mod");
    language = "go";
  }

  // ── Infer test command ─────────────────────────────────────────────────
  let testCommand: string | null = null;

  if (packageManager !== "none" && Object.keys(scripts).length > 0) {
    const testScript = pickScript(scripts, ["test", "test:run", "test:ci"]);
    if (testScript) {
      const runner =
        packageManager === "bun"
          ? "bun"
          : packageManager === "yarn"
            ? "yarn"
            : packageManager === "pnpm"
              ? "pnpm"
              : "npm";
      testCommand = `${runner} ${packageManager === "npm" ? "run " : ""}${testScript}`;
    }
  }

  // Fallback: bun test / pytest / cargo test / go test
  if (!testCommand) {
    if (packageManager === "bun") testCommand = "bun test";
    else if (language === "python") testCommand = "pytest";
    else if (language === "rust") testCommand = "cargo test";
    else if (language === "go") testCommand = "go test ./...";
  }

  // ── Infer build / type-check command ──────────────────────────────────
  let buildCommand: string | null = null;

  if (packageManager !== "none" && Object.keys(scripts).length > 0) {
    const buildScript = pickScript(scripts, [
      "typecheck",
      "type-check",
      "build",
      "compile",
      "check",
    ]);
    if (buildScript) {
      const runner =
        packageManager === "bun"
          ? "bun"
          : packageManager === "yarn"
            ? "yarn"
            : packageManager === "pnpm"
              ? "pnpm"
              : "npm";
      buildCommand = `${runner} ${packageManager === "npm" ? "run " : ""}${buildScript}`;
    }
  }

  // Fallback: tsc / cargo check / go build
  if (!buildCommand) {
    if (hasTsConfig) {
      buildCommand =
        packageManager === "bun" ? "bunx tsc --noEmit" : "npx tsc --noEmit";
    } else if (language === "rust") {
      buildCommand = "cargo check";
    } else if (language === "go") {
      buildCommand = "go build ./...";
    }
  }

  // ── Infer lint command ─────────────────────────────────────────────────
  let lintCommand: string | null = null;

  if (packageManager !== "none" && Object.keys(scripts).length > 0) {
    const lintScript = pickScript(scripts, ["lint", "lint:fix", "eslint"]);
    if (lintScript) {
      const runner =
        packageManager === "bun"
          ? "bun"
          : packageManager === "yarn"
            ? "yarn"
            : packageManager === "pnpm"
              ? "pnpm"
              : "npm";
      lintCommand = `${runner} ${packageManager === "npm" ? "run " : ""}${lintScript}`;
    }
  }

  // ── Build hints ────────────────────────────────────────────────────────
  if (testCommand) {
    hints.push(`Run '${testCommand}' to execute the test suite.`);
  } else {
    hints.push(
      "No test command detected. Add a 'test' script to package.json or install a test runner.",
    );
  }

  if (buildCommand) {
    hints.push(`Run '${buildCommand}' for a type/build check (no output files written).`);
  }

  if (lintCommand) {
    hints.push(`Run '${lintCommand}' to lint the project.`);
  }

  hints.push(
    "After every code change: run the build command first (fast), then the test command.",
  );

  if (hasTsConfig && !buildCommand?.includes("tsc")) {
    hints.push("tsconfig.json found — always run tsc --noEmit to catch type errors.");
  }

  return {
    packageManager,
    scripts,
    testCommand,
    buildCommand,
    lintCommand,
    language,
    configFiles,
    hints,
  };
};
