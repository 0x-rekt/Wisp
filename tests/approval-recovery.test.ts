import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import { sessionManager } from "../session";
import { readFileTool, runCommandTool } from "../tools/tools";
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

describe("tool callId correlation", () => {
  it("records tool execution with actual tool-call ID from context", async () => {
    sessionManager.start("test-model");

    fs.writeFileSync("sample.txt", "hello wisp", "utf-8");

    const toolCtx = { callId: "call-abc-123" } as any;
    const result = await readFileTool.function.execute(
      { filepath: "sample.txt" },
      toolCtx,
    );

    expect(result.content).toBe("hello wisp");

    const session = sessionManager.current;
    expect(session).not.toBeNull();
    expect(session?.toolResults).toHaveLength(1);
    expect(session?.toolResults[0]?.callId).toBe("call-abc-123");
    expect(session?.toolResults[0]?.name).toBe("read_file");
  });
});

describe("end-to-end approval recovery workflow", () => {
  it("handles command failure followed by approval of a corrected command", async () => {
    const session = sessionManager.start("test-model");

    // Step 1: Record initial prompt and approval-gated tool call for a command that will fail
    sessionManager.appendPrompt("Run type check");
    const call1Id = "call-cmd-failed";
    sessionManager.appendToolCall({
      id: call1Id,
      name: "run_command",
      arguments: { command: "non_existent_command_12345" },
    });

    // Step 2: User approves the first command call
    sessionManager.appendApproval({
      callId: call1Id,
      name: "run_command",
      approved: true,
      decidedAt: new Date().toISOString(),
    });

    // Execute the failing command
    const res1 = await runCommandTool.function.execute(
      { command: "non_existent_command_12345" },
      { callId: call1Id } as any,
    );

    expect(res1.exitCode).not.toBe(0);
    expect(sessionManager.current?.toolResults).toHaveLength(1);
    expect(sessionManager.current?.toolResults[0]?.callId).toBe(call1Id);
    expect(sessionManager.current?.status).toBe("active");

    // Step 3: Agent proposes corrected command after inspecting failure
    const call2Id = "call-cmd-corrected";
    sessionManager.appendToolCall({
      id: call2Id,
      name: "run_command",
      arguments: { command: "echo 'fixed'" },
    });

    // User approves corrected command
    sessionManager.appendApproval({
      callId: call2Id,
      name: "run_command",
      approved: true,
      decidedAt: new Date().toISOString(),
    });

    // Execute corrected command
    const res2 = await runCommandTool.function.execute(
      { command: "echo 'fixed'" },
      { callId: call2Id } as any,
    );

    expect(res2.exitCode).toBe(0);
    expect(res2.stdout).toContain("fixed");

    // Session completes
    sessionManager.markComplete("Command successfully corrected and executed.");

    const finalSession = sessionManager.current;
    expect(finalSession?.status).toBe("complete");
    expect(finalSession?.toolCalls).toHaveLength(2);
    expect(finalSession?.approvalDecisions).toHaveLength(2);
    expect(finalSession?.toolResults).toHaveLength(2);
    expect(finalSession?.toolResults[0]?.callId).toBe(call1Id);
    expect(finalSession?.toolResults[1]?.callId).toBe(call2Id);
  });

  it("supports recursive approval handling for multi-step tool call chains", async () => {
    sessionManager.start("test-model");

    let approvalCount = 0;
    const mockApprovalHandler = async (pendingCalls: Array<{ id: string; name: string }>) => {
      approvalCount += pendingCalls.length;
    };

    // Simulate multi-step tool approval recording
    const pendingCalls1 = [{ id: "call-1", name: "run_command", arguments: {} }];
    sessionManager.appendToolCall({ id: "call-1", name: "run_command", arguments: {} });
    await mockApprovalHandler(pendingCalls1);

    const pendingCalls2 = [{ id: "call-2", name: "edit_file", arguments: {} }];
    sessionManager.appendToolCall({ id: "call-2", name: "edit_file", arguments: {} });
    await mockApprovalHandler(pendingCalls2);

    expect(approvalCount).toBe(2);
    expect(sessionManager.current?.toolCalls).toHaveLength(2);
  });
});
