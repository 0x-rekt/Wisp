import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import { getProjectInfo } from "../tools/project-info";
import { projectInfoTool } from "../tools/tools";
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

describe("project_info tool", () => {
  it("detects bun package manager, scripts, and test/build commands", () => {
    writeWorkspaceFile(
      ws,
      "package.json",
      JSON.stringify({
        name: "test-pkg",
        scripts: {
          test: "bun test",
          build: "bun build index.ts",
        },
      }),
    );
    writeWorkspaceFile(ws, "bun.lock", "");
    writeWorkspaceFile(ws, "tsconfig.json", "{}");

    const info = getProjectInfo();
    expect(info.packageManager).toBe("bun");
    expect(info.language).toBe("typescript");
    expect(info.testCommand).toBe("bun test");
    expect(info.buildCommand).toBe("bun build");
    expect(info.configFiles).toContain("package.json");
    expect(info.configFiles).toContain("bun.lock");
    expect(info.configFiles).toContain("tsconfig.json");
  });

  it("detects python project with pytest", () => {
    writeWorkspaceFile(ws, "pytest.ini", "[pytest]");

    const info = getProjectInfo();
    expect(info.language).toBe("python");
    expect(info.testCommand).toBe("pytest");
    expect(info.configFiles).toContain("pytest.ini");
  });

  it("detects rust project with cargo", () => {
    writeWorkspaceFile(ws, "Cargo.toml", "[package]");

    const info = getProjectInfo();
    expect(info.language).toBe("rust");
    expect(info.testCommand).toBe("cargo test");
    expect(info.buildCommand).toBe("cargo check");
  });
});
