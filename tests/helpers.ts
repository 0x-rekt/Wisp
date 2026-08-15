import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGINAL_CWD = process.cwd();

export function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-test-"));
  return dir;
}

export function withCwd(dir: string) {
  process.chdir(dir);
}

export function restoreCwd() {
  process.chdir(ORIGINAL_CWD);
}

export function writeWorkspaceFile(dir: string, rel: string, content: string) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
  return abs;
}
