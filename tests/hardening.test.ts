import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { getSanitizedEnv, runCommand } from "../tools/commands";
import { shouldRequireApproval } from "../tools/tools";
import { Logger, getLogFilePath } from "../telemetry/logger";
import { createSessionData, recoverInterruptedSessions } from "../session";
import { makeWorkspace, restoreCwd, withCwd } from "./helpers";

let ws = "";

beforeEach(() => {
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
  ws = makeWorkspace();
  withCwd(ws);
});

afterEach(() => {
  restoreCwd();
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
});

describe("Production Hardening", () => {
  it("sanitizes sensitive environment variables from command execution environment", () => {
    process.env.OPENROUTER_API_KEY = "sk-secret-key";
    process.env.TAVILY_API_KEY = "tvly-secret-key";
    process.env.AWS_SECRET_ACCESS_KEY = "aws-secret";

    const sanitized = getSanitizedEnv();
    expect(sanitized.OPENROUTER_API_KEY).toBeUndefined();
    expect(sanitized.TAVILY_API_KEY).toBeUndefined();
    expect(sanitized.AWS_SECRET_ACCESS_KEY).toBeUndefined();

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  it("blocks dangerous netcat listeners and fork bombs", async () => {
    await expect(runCommand("nc -l 8080")).rejects.toThrow(/blocked/);
    await expect(runCommand("netcat -l -p 9999")).rejects.toThrow(/blocked/);
    await expect(runCommand("nohup sleep 10 &")).rejects.toThrow(/blocked/);
  });

  it("evaluates configurable permission modes correctly", () => {
    // Mode: always-ask
    expect(shouldRequireApproval("write_file", "always-ask")).toBe(true);
    expect(shouldRequireApproval("run_command", "always-ask")).toBe(true);

    // Mode: ask-write
    expect(shouldRequireApproval("read_file", "ask-write")).toBe(false);
    expect(shouldRequireApproval("project_info", "ask-write")).toBe(false);
    expect(shouldRequireApproval("write_file", "ask-write")).toBe(true);
    expect(shouldRequireApproval("run_command", "ask-write")).toBe(true);

    // Mode: ask-destructive
    expect(shouldRequireApproval("read_file", "ask-destructive")).toBe(false);
    expect(shouldRequireApproval("write_file", "ask-destructive")).toBe(false);
    expect(shouldRequireApproval("delete_file", "ask-destructive")).toBe(true);
    expect(shouldRequireApproval("run_command", "ask-destructive")).toBe(true);

    // Mode: never-ask
    expect(shouldRequireApproval("delete_file", "never-ask")).toBe(false);
    expect(shouldRequireApproval("run_command", "never-ask")).toBe(false);
  });

  it("logs telemetry events to structured JSON log file", () => {
    process.env.WISP_LOG_DIR = path.join(ws, ".agent", "logs");
    const testLogger = new Logger();

    testLogger.info("test_event", { foo: "bar" });
    testLogger.error("test_failure", new Error("boom"));

    const logFile = getLogFilePath();
    expect(fs.existsSync(logFile)).toBe(true);

    const contents = fs.readFileSync(logFile, "utf-8").trim().split("\n");
    expect(contents.length).toBe(2);

    const parsed1 = JSON.parse(contents[0]!);
    expect(parsed1.event).toBe("test_event");
    expect(parsed1.data.foo).toBe("bar");

    const parsed2 = JSON.parse(contents[1]!);
    expect(parsed2.event).toBe("test_failure");
    expect(parsed2.error).toBe("boom");

    delete process.env.WISP_LOG_DIR;
  });

  it("detects interrupted sessions for crash recovery", () => {
    const sessionsDir = path.join(ws, "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const activeSession = createSessionData("test-model");
    activeSession.status = "active";
    fs.writeFileSync(
      path.join(sessionsDir, `${activeSession.id}.json`),
      JSON.stringify(activeSession),
    );

    const completedSession = createSessionData("test-model");
    completedSession.status = "complete";
    fs.writeFileSync(
      path.join(sessionsDir, `${completedSession.id}.json`),
      JSON.stringify(completedSession),
    );

    const interrupted = recoverInterruptedSessions(sessionsDir);
    expect(interrupted.length).toBe(1);
    expect(interrupted[0]?.id).toBe(activeSession.id);
  });
});
