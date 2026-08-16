import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { logger } from "../telemetry/logger";

export type SessionToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type SessionApprovalDecision = {
  callId: string;
  name: string;
  approved: boolean;
  decidedAt: string;
};

export type SessionToolResult = {
  callId: string;
  name: string;
  result: unknown;
  changedFiles?: string[];
  error?: string;
  completedAt: string;
};

export type SessionStatus = "active" | "complete" | "error";

export type SessionData = {
  id: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  prompts: string[];
  responses: string[];
  toolCalls: SessionToolCall[];
  approvalDecisions: SessionApprovalDecision[];
  toolResults: SessionToolResult[];
  changedFiles: string[];
  error?: string;
  agentState?: unknown;
  verificationRequired?: boolean;
  verificationPassed?: boolean;
  verificationCommand?: string;
};

export function getSessionsDir(): string {
  return join(process.cwd(), ".agent", "sessions");
}

export function getSessionPath(id: string): string {
  return join(getSessionsDir(), `${id}.json`);
}

export function newSessionId(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const base = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
  return `${base}-${now.getUTCMilliseconds()}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function createSessionData(model: string): SessionData {
  const now = new Date().toISOString();
  return {
    id: newSessionId(),
    model,
    createdAt: now,
    updatedAt: now,
    status: "active",
    prompts: [],
    responses: [],
    toolCalls: [],
    approvalDecisions: [],
    toolResults: [],
    changedFiles: [],
  };
}

export class SessionManager {
  private data: SessionData | null = null;

  get current(): SessionData | null {
    return this.data;
  }

  start(model: string): SessionData {
    this.data = createSessionData(model);
    logger.info("session_start", { id: this.data.id, model });
    this.persist();
    return this.data;
  }

  reset(): void {
    if (this.data) {
      logger.info("session_reset", { id: this.data.id });
    }
    this.data = null;
  }

  resume(session: SessionData): SessionData {
    this.data = session;
    this.data.status = "active";
    logger.info("session_resume", { id: this.data.id, model: session.model });
    this.touch();
    return this.data;
  }

  appendPrompt(text: string): void {
    if (!this.data) return;
    this.data.prompts.push(text);
    logger.info("user_prompt", { prompt: text });
    this.touch();
  }

  appendResponse(text: string): void {
    if (!this.data) return;
    this.data.responses.push(text);
    logger.info("agent_response", { response: text });
    this.touch();
  }

  appendToolCall(call: SessionToolCall): void {
    if (!this.data) return;
    this.data.toolCalls.push(call);
    logger.info("tool_call_emitted", { callId: call.id, name: call.name });
    this.touch();
  }

  appendApproval(decision: SessionApprovalDecision): void {
    if (!this.data) return;
    this.data.approvalDecisions.push(decision);
    logger.info("tool_approval_decision", {
      callId: decision.callId,
      name: decision.name,
      approved: decision.approved,
    });
    this.touch();
  }

  appendToolResult(result: SessionToolResult): void {
    if (!this.data) return;
    this.data.toolResults.push(result);
    if (result.changedFiles && result.changedFiles.length > 0) {
      for (const file of result.changedFiles) {
        if (!this.data.changedFiles.includes(file)) {
          this.data.changedFiles.push(file);
        }
      }
    }
    logger.info("tool_result_recorded", {
      callId: result.callId,
      name: result.name,
      error: result.error,
    });
    this.touch();
  }

  requireVerification(): void {
    if (!this.data) return;
    this.data.verificationRequired = true;
    this.data.verificationPassed = false;
    this.touch();
  }

  recordVerification(command: string, passed: boolean): void {
    if (!this.data) return;
    this.data.verificationCommand = command;
    this.data.verificationPassed = passed;
    if (passed) this.data.verificationRequired = false;
    this.touch();
  }

  markComplete(response: string): void {
    if (!this.data) return;
    const agentState = this.data.agentState as {
      pendingToolCalls?: unknown[];
    } | undefined;
    if (agentState?.pendingToolCalls && agentState.pendingToolCalls.length > 0) {
      this.touch();
      return;
    }
    if (this.data.verificationRequired && !this.data.verificationPassed) {
      this.touch();
      return;
    }
    this.data.responses.push(response);
    this.data.status = "complete";
    logger.info("session_complete", { id: this.data.id });
    this.touch();
  }

  markError(error: string): void {
    if (!this.data) return;
    this.data.error = error;
    this.data.status = "error";
    logger.error("session_error", error, { id: this.data.id });
    this.touch();
  }

  setAgentState(state: unknown): void {
    if (!this.data) return;
    this.data.agentState = state;
    this.touch();
  }

  setModel(model: string): void {
    if (!this.data) return;
    this.data.model = model;
    this.touch();
  }

  persist(): void {
    if (!this.data) return;
    const dir = getSessionsDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const sessionPath = getSessionPath(this.data.id);
    const tempPath = sessionPath + ".tmp-" + process.pid;
    writeFileSync(tempPath, JSON.stringify(this.data, null, 2) + "\n", "utf-8");
    renameSync(tempPath, sessionPath);
  }

  private touch(): void {
    if (!this.data) return;
    this.data.updatedAt = new Date().toISOString();
    this.persist();
  }

  saveTo(dir: string): void {
    if (!this.data) return;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${this.data.id}.json`),
      JSON.stringify(this.data, null, 2) + "\n",
      "utf-8",
    );
  }
}

export function loadSession(id: string, dir = getSessionsDir()): SessionData | null {
  if (!/^\d{14}-[a-z0-9]+$/.test(id)) return null;

  const filePath = join(dir, `${id}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as SessionData;
  } catch {
    return null;
  }
}

export function listSessions(dir = getSessionsDir()): SessionData[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(
          readFileSync(join(dir, name), "utf-8"),
        ) as SessionData;
      } catch {
        return null;
      }
    })
    .filter((s): s is SessionData => s !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Returns any sessions left in 'active' status from previous runs that may have
 * experienced an unexpected exit or power interruption.
 */
export function recoverInterruptedSessions(dir = getSessionsDir()): SessionData[] {
  return listSessions(dir).filter((session) => session.status === "active");
}

export const sessionManager = new SessionManager();
