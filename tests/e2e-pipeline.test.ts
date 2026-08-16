import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { setConversationState } from "../agent/client";
import { sessionManager, loadSession, listSessions, getSessionsDir } from "../session";
import {
  writeFileTool,
  editFileTool,
  deleteFileTool,
  runCommandTool,
  projectInfoTool,
} from "../tools/tools";
import { makeWorkspace, restoreCwd, withCwd, writeWorkspaceFile } from "./helpers";

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

describe("End-to-End Pipeline Experience", () => {
  it("executes complete lifecycle: prompt → tool call → approval → execution → result → persistence → resume", async () => {
    // ── Turn 1: Initial user prompt & tool discovery ─────────────────────
    const session = sessionManager.start("openrouter/auto");
    const sessionId = session.id;

    // User submits prompt
    sessionManager.appendPrompt("Discover project structure and setup source files");

    // Agent emits pending tool call for project_info
    const call1Id = "call-discover-1";
    sessionManager.appendToolCall({
      id: call1Id,
      name: "project_info",
      arguments: {},
    });

    // Approval (project_info auto-executes, recorded as approved)
    sessionManager.appendApproval({
      callId: call1Id,
      name: "project_info",
      approved: true,
      decidedAt: new Date().toISOString(),
    });

    // Tool Execution
    writeWorkspaceFile(
      ws,
      "package.json",
      JSON.stringify({ name: "e2e-app", scripts: { test: "echo 'all tests pass'" } }),
    );
    writeWorkspaceFile(ws, "bun.lock", "");

    const infoResult = await projectInfoTool.function.execute({}, { callId: call1Id } as any);
    expect(infoResult.packageManager).toBe("bun");
    expect(infoResult.testCommand).toBe("bun test");

    // Agent emits second tool call to write code file
    const call2Id = "call-write-2";
    sessionManager.appendToolCall({
      id: call2Id,
      name: "write_file",
      arguments: {
        filepath: "src/utils.ts",
        content: "export const multiply = (a: number, b: number) => a * b;\n",
      },
    });

    // User approves file write
    sessionManager.appendApproval({
      callId: call2Id,
      name: "write_file",
      approved: true,
      decidedAt: new Date().toISOString(),
    });

    // Tool Execution
    const writeResult = await writeFileTool.function.execute(
      {
        filepath: "src/utils.ts",
        content: "export const multiply = (a: number, b: number) => a * b;\n",
      },
      { callId: call2Id } as any,
    );

    expect(writeResult.created).toBe(true);
    expect(fs.readFileSync(path.join(ws, "src/utils.ts"), "utf-8")).toContain("multiply");

    // Agent stores conversation state and verifies Turn 1 before completing
    sessionManager.recordVerification("bun test", true);
    const turn1AgentState = {
      messages: [
        { role: "user", content: "Discover project structure and setup source files" },
        { role: "assistant", content: "Created src/utils.ts with multiply helper." },
      ],
    };
    sessionManager.setAgentState(turn1AgentState);
    sessionManager.markComplete("Created src/utils.ts with multiply helper.");

    // Verify session state on disk
    const diskSessionBeforeResume = loadSession(sessionId);
    expect(diskSessionBeforeResume).not.toBeNull();
    expect(diskSessionBeforeResume?.status).toBe("complete");
    expect(diskSessionBeforeResume?.changedFiles).toContain("src/utils.ts");
    expect(diskSessionBeforeResume?.toolCalls).toHaveLength(2);
    expect(diskSessionBeforeResume?.approvalDecisions).toHaveLength(2);
    expect(diskSessionBeforeResume?.toolResults).toHaveLength(2);

    // ── Turn 2: Session Resume & Follow-up Prompt ───────────────────────
    // Reset agent state to simulate restart / new session CLI invocation
    setConversationState(null);

    // Reload session from disk
    const reloadedSession = loadSession(sessionId);
    expect(reloadedSession).not.toBeNull();

    // Restore state in client & session manager
    setConversationState(reloadedSession?.agentState as any);
    const activeSession = sessionManager.resume(reloadedSession!);
    expect(activeSession.id).toBe(sessionId);
    expect(activeSession.status).toBe("active");
    expect(activeSession.changedFiles).toContain("src/utils.ts");

    // User submits follow-up prompt
    sessionManager.appendPrompt("Add a unit test and run verification");

    // Agent emits write_file for test file
    const call3Id = "call-write-test-3";
    sessionManager.appendToolCall({
      id: call3Id,
      name: "write_file",
      arguments: {
        filepath: "tests/utils.test.ts",
        content: "import { multiply } from '../src/utils'; console.log(multiply(2, 3));\n",
      },
    });

    sessionManager.appendApproval({
      callId: call3Id,
      name: "write_file",
      approved: true,
      decidedAt: new Date().toISOString(),
    });

    await writeFileTool.function.execute(
      {
        filepath: "tests/utils.test.ts",
        content: "import { multiply } from '../src/utils'; console.log(multiply(2, 3));\n",
      },
      { callId: call3Id } as any,
    );

    // Agent emits run_command for verification
    const call4Id = "call-run-verify-4";
    sessionManager.appendToolCall({
      id: call4Id,
      name: "run_command",
      arguments: { command: "bun run test" },
    });

    sessionManager.appendApproval({
      callId: call4Id,
      name: "run_command",
      approved: true,
      decidedAt: new Date().toISOString(),
    });

    const cmdResult = await runCommandTool.function.execute(
      { command: "bun run test" },
      { callId: call4Id } as any,
    );
    expect(cmdResult.exitCode).toBe(0);
    expect(cmdResult.stdout).toContain("all tests pass");

    // Complete Turn 2
    sessionManager.markComplete("All tests created and verification passed successfully.");

    // Final verification of complete persisted session
    const finalPersisted = loadSession(sessionId);
    expect(finalPersisted?.status).toBe("complete");
    expect(finalPersisted?.prompts).toEqual([
      "Discover project structure and setup source files",
      "Add a unit test and run verification",
    ]);
    expect(finalPersisted?.responses).toEqual([
      "Created src/utils.ts with multiply helper.",
      "All tests created and verification passed successfully.",
    ]);
    expect(finalPersisted?.changedFiles).toEqual(["src/utils.ts", "tests/utils.test.ts"]);
    expect(finalPersisted?.toolResults).toHaveLength(4);
  });

  it("handles user rejection workflow cleanly: prompt → tool call → user rejection → result logged → agent continuation", async () => {
    const session = sessionManager.start("openrouter/auto");
    const sessionId = session.id;

    sessionManager.appendPrompt("Remove configuration file");

    writeWorkspaceFile(ws, "config.json", "{ \"env\": \"prod\" }");

    // Agent proposes delete_file
    const callId = "call-del-rejected";
    sessionManager.appendToolCall({
      id: callId,
      name: "delete_file",
      arguments: { filepath: "config.json" },
    });

    // User rejects approval
    sessionManager.appendApproval({
      callId,
      name: "delete_file",
      approved: false,
      decidedAt: new Date().toISOString(),
    });

    // Log rejection result to session
    sessionManager.appendToolResult({
      callId,
      name: "delete_file",
      result: null,
      error: "User rejected delete_file",
      completedAt: new Date().toISOString(),
    });

    // File MUST still exist on disk
    expect(fs.existsSync(path.join(ws, "config.json"))).toBe(true);

    // Agent recovers by performing edit_file instead
    const editCallId = "call-edit-approved";
    sessionManager.appendToolCall({
      id: editCallId,
      name: "edit_file",
      arguments: {
        filepath: "config.json",
        oldStr: "\"prod\"",
        newStr: "\"staging\"",
      },
    });

    sessionManager.appendApproval({
      callId: editCallId,
      name: "edit_file",
      approved: true,
      decidedAt: new Date().toISOString(),
    });

    await editFileTool.function.execute(
      { filepath: "config.json", oldStr: "\"prod\"", newStr: "\"staging\"" },
      { callId: editCallId } as any,
    );

    sessionManager.recordVerification("bun test", true);
    sessionManager.markComplete("Updated configuration to staging without deleting.");

    const persisted = loadSession(sessionId);
    expect(persisted?.status).toBe("complete");
    expect(persisted?.approvalDecisions).toHaveLength(2);
    expect(persisted?.approvalDecisions[0]?.approved).toBe(false);
    expect(persisted?.approvalDecisions[1]?.approved).toBe(true);
    expect(fs.readFileSync(path.join(ws, "config.json"), "utf-8")).toContain("staging");
  });
});
