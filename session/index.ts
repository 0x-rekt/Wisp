import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

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
    this.persist();
    return this.data;
  }

  reset(): void {
    this.data = null;
  }

  resume(session: SessionData): SessionData {
    this.data = session;
    this.data.status = "active";
    this.touch();
    return this.data;
  }

  appendPrompt(text: string): void {
    if (!this.data) return;
    this.data.prompts.push(text);
    this.touch();
  }

  appendResponse(text: string): void {
    if (!this.data) return;
    this.data.responses.push(text);
    this.touch();
  }

  appendToolCall(call: SessionToolCall): void {
    if (!this.data) return;
    this.data.toolCalls.push(call);
    this.touch();
  }

  appendApproval(decision: SessionApprovalDecision): void {
    if (!this.data) return;
    this.data.approvalDecisions.push(decision);
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
    this.data.responses.push(response);
    this.data.status = "complete";
    this.touch();
  }

  markError(error: string): void {
    if (!this.data) return;
    this.data.error = error;
    this.data.status = "error";
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
    writeFileSync(
      getSessionPath(this.data.id),
      JSON.stringify(this.data, null, 2) + "\n",
      "utf-8",
    );
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

export const sessionManager = new SessionManager();
