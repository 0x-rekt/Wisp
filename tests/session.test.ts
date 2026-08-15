import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  SessionManager,
  createSessionData,
  getSessionPath,
  getSessionsDir,
  listSessions,
  loadSession,
  newSessionId,
} from "../session";
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

describe("session ids and paths", () => {
  it("generates a timestamp-based id", () => {
    const id = newSessionId();
    expect(id).toMatch(/^\d{14}-[a-z0-9]+$/);
  });

  it("points the sessions dir into .agent/sessions", () => {
    expect(getSessionsDir()).toBe(path.join(process.cwd(), ".agent", "sessions"));
    expect(getSessionPath("123")).toBe(
      path.join(process.cwd(), ".agent", "sessions", "123.json"),
    );
  });
});

describe("SessionManager", () => {
  it("starts a session and persists it to disk", () => {
    const manager = new SessionManager();
    const session = manager.start("model/a");
    expect(session.id).toMatch(/^\d{14}-[a-z0-9]+$/);
    expect(session.status).toBe("active");
    expect(manager.current).toBe(session);
    expect(fs.existsSync(getSessionPath(session.id))).toBe(true);
  });

  it("records user prompts", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.appendPrompt("hello");
    manager.appendPrompt("world");
    expect(manager.current?.prompts).toEqual(["hello", "world"]);
  });

  it("records responses", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.appendResponse("first reply");
    expect(manager.current?.responses).toEqual(["first reply"]);
  });

  it("records tool calls with arguments", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.appendToolCall({
      id: "call-1",
      name: "edit_file",
      arguments: { filepath: "a.ts", oldStr: "x", newStr: "y" },
    });
    expect(manager.current?.toolCalls).toHaveLength(1);
    expect(manager.current?.toolCalls[0]?.name).toBe("edit_file");
    expect(manager.current?.toolCalls[0]?.arguments).toEqual({
      filepath: "a.ts",
      oldStr: "x",
      newStr: "y",
    });
  });

  it("records approval decisions", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.appendApproval({
      callId: "call-1",
      name: "write_file",
      approved: true,
      decidedAt: new Date().toISOString(),
    });
    expect(manager.current?.approvalDecisions).toHaveLength(1);
    expect(manager.current?.approvalDecisions[0]?.approved).toBe(true);
  });

  it("records tool results and changed files", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.appendToolResult({
      callId: "call-1",
      name: "write_file",
      result: { path: "a.ts", created: true },
      changedFiles: ["a.ts"],
      completedAt: new Date().toISOString(),
    });
    expect(manager.current?.toolResults).toHaveLength(1);
    expect(manager.current?.changedFiles).toEqual(["a.ts"]);
  });

  it("deduplicates changed files", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.appendToolResult({
      callId: "call-1",
      name: "write_file",
      result: {},
      changedFiles: ["a.ts"],
      completedAt: new Date().toISOString(),
    });
    manager.appendToolResult({
      callId: "call-2",
      name: "edit_file",
      result: {},
      changedFiles: ["a.ts", "b.ts"],
      completedAt: new Date().toISOString(),
    });
    expect(manager.current?.changedFiles).toEqual(["a.ts", "b.ts"]);
  });

  it("marks the session complete with a final response", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.markComplete("done");
    expect(manager.current?.status).toBe("complete");
    expect(manager.current?.responses).toContain("done");
  });

  it("marks the session as errored", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.markError("something failed");
    expect(manager.current?.status).toBe("error");
    expect(manager.current?.error).toBe("something failed");
  });

  it("stores agent state for resume", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.setAgentState({ id: "conv-1", messages: [] });
    expect(manager.current?.agentState).toEqual({ id: "conv-1", messages: [] });
  });

  it("updates the model", () => {
    const manager = new SessionManager();
    manager.start("model/a");
    manager.setModel("model/b");
    expect(manager.current?.model).toBe("model/b");
  });

  it("resumes an existing session without creating a new id", () => {
    const manager = new SessionManager();
    const original = manager.start("model/a");
    manager.appendPrompt("keep this history");

    const saved = loadSession(original.id);
    expect(saved).not.toBeNull();

    const resumed = manager.resume(saved!);
    expect(resumed.id).toBe(original.id);
    expect(resumed.prompts).toEqual(["keep this history"]);
    expect(resumed.status).toBe("active");
    expect(manager.current?.id).toBe(original.id);
  });

  it("persists accumulated data to disk and reloads it", () => {
    const manager = new SessionManager();
    const session = manager.start("model/a");
    manager.appendPrompt("prompt");
    manager.appendToolResult({
      callId: "call-1",
      name: "edit_file",
      result: { path: "a.ts" },
      changedFiles: ["a.ts"],
      completedAt: new Date().toISOString(),
    });
    const loaded = loadSession(session.id);
    expect(loaded?.prompts).toEqual(["prompt"]);
    expect(loaded?.changedFiles).toEqual(["a.ts"]);
  });

  it("does nothing for recording methods without an active session", () => {
    const manager = new SessionManager();
    manager.appendPrompt("x");
    manager.appendResponse("y");
    expect(manager.current).toBeNull();
  });
});

describe("loadSession and listSessions", () => {
  it("returns null for a missing session", () => {
    expect(loadSession("does-not-exist")).toBeNull();
  });

  it("rejects invalid session ids", () => {
    expect(loadSession("../../outside")).toBeNull();
  });

  it("returns null for a corrupted session file", () => {
    const dir = path.join(ws, ".agent", "sessions");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "bad.json"), "not json", "utf-8");
    expect(loadSession("bad")).toBeNull();
  });

  it("lists sessions newest-first and ignores non-json files", () => {
    const dir = path.join(ws, ".agent", "sessions");
    fs.mkdirSync(dir, { recursive: true });
    const a = createSessionData("model/a");
    const b = createSessionData("model/b");
    a.createdAt = "2026-01-01T00:00:00.000Z";
    b.createdAt = "2026-01-02T00:00:00.000Z";
    fs.writeFileSync(path.join(dir, `${a.id}.json`), JSON.stringify(a), "utf-8");
    fs.writeFileSync(path.join(dir, `${b.id}.json`), JSON.stringify(b), "utf-8");
    fs.writeFileSync(path.join(dir, "readme.txt"), "ignore me", "utf-8");
    const sessions = listSessions(dir);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.id).toBe(b.id);
    expect(sessions[1]?.id).toBe(a.id);
  });

  it("returns an empty list when the directory does not exist", () => {
    expect(listSessions(path.join(ws, "nope"))).toEqual([]);
  });
});

describe("createSessionData", () => {
  it("creates empty session data with defaults", () => {
    const data = createSessionData("model/a");
    expect(data.status).toBe("active");
    expect(data.prompts).toEqual([]);
    expect(data.toolCalls).toEqual([]);
    expect(data.approvalDecisions).toEqual([]);
    expect(data.toolResults).toEqual([]);
    expect(data.changedFiles).toEqual([]);
    expect(data.model).toBe("model/a");
  });
});
