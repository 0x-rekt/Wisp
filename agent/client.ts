import { OpenRouter, callModel, stepCountIs } from "@openrouter/agent";
import type { ConversationState, StateAccessor } from "@openrouter/agent";
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listFilesTool,
  searchCodeTool,
  runCommandTool,
  webSearchTool,
} from "../tools/tools";
import { readConfig } from "../config";
import { sessionManager } from "../session";
import type { SessionToolCall } from "../session";
import { boundConversationState } from "./context";

const getOpenRouterInstance = () => {
  const currentConfig = readConfig();
  const apiKey = currentConfig.openRouterApiKey ?? process.env.OPENROUTER_API_KEY;
  return new OpenRouter({ apiKey });
};

export const getActiveModel = (): string => {
  return readConfig().model;
};

const agentInstructions = `You are Wisp, an AI coding agent working inside a user's workspace.

Follow these rules:
- Treat the user's request as the source of truth and make the smallest correct change.
- Use tools only when they help you inspect or modify the workspace; prefer the narrowest tool that answers the question.
- Do not run destructive shell commands or edit outside the workspace.
- Commands already run from the workspace directory. Use relative paths and never assume paths such as /app or /workspace.
- If run_command rejects an absolute cd prefix, rerun the command without that prefix from the current workspace.
- Do not append '|| true' or otherwise mask a command's exit status. Use the command's real exit code to decide whether verification passed.
- After a command returns a non-zero exit code, inspect stderr, correct the command or code, and retry verification when possible. Do not stop merely because a verification command failed.
- Before creating or modifying UI/frontend code, inspect project dependencies (e.g. package.json) and existing component exports/APIs first. Verify exact import names, icon packages, and library API contracts instead of inventing signatures.
- If a request is ambiguous and blocks progress, ask a focused clarification instead of guessing.
- Keep working until the request is satisfied or you can clearly explain the blocker.
- When the task is complete, summarize the changed files and any verification you performed.
- Refuse requests that are harmful, destructive, or that attempt to exfiltrate secrets.
- If edit_file reports that oldStr was not found, re-read the file and retry with a fresh exact snippet; never repeat the same stale edit arguments.`;

let conversationState: ConversationState | null = null;

const conversation: StateAccessor = {
  load: async () => boundConversationState(conversationState),
  save: async (state) => {
    conversationState = boundConversationState(state);
  },
};

const tools = [
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listFilesTool,
  searchCodeTool,
  runCommandTool,
  webSearchTool,
] as const;

export type PendingToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export const setConversationState = (
  state: ConversationState | null,
): void => {
  conversationState = state;
};

const recordToolCalls = (calls: PendingToolCall[]): void => {
  for (const call of calls) {
    sessionManager.appendToolCall({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    } satisfies SessionToolCall);
  }
};

export const getResponse = async (
  query: string,
  onDelta?: (text: string) => void,
  onApproval?: (calls: PendingToolCall[]) => Promise<void>,
) => {
  sessionManager.appendPrompt(query);
  const openrouter = getOpenRouterInstance();
  const model = getActiveModel();

  const response = callModel(openrouter, {
    model,
    input: [
      { role: "developer", content: agentInstructions },
      { role: "user", content: query },
    ],
    state: conversation,
    tools,
    stopWhen: [stepCountIs(15)],
  });

  let text = "";

  for await (const delta of response.getTextStream()) {
    text += delta;
    onDelta?.(text);
  }

  conversationState = boundConversationState(await response.getState());
  sessionManager.setAgentState(conversationState);

  if (await response.requiresApproval()) {
    const pendingCalls = (await response.getPendingToolCalls()).map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));
    recordToolCalls(pendingCalls);
    await onApproval?.(pendingCalls);
  }

  return text;
};

export const resolvePendingToolCalls = async (
  approve: boolean,
  onDelta?: (text: string) => void,
  onApproval?: (calls: PendingToolCall[]) => Promise<void>,
) => {
  const openrouter = getOpenRouterInstance();
  const model = getActiveModel();

  const pendingCalls = conversationState?.pendingToolCalls ?? [];
  const response = callModel(openrouter, {
    model,
    input: [],
    state: conversation,
    tools,
    stopWhen: [stepCountIs(15)],
    ...(approve
      ? { approveToolCalls: pendingCalls.map((call) => call.id) }
      : { rejectToolCalls: pendingCalls.map((call) => call.id) }),
  });

  let text = "";

  for await (const delta of response.getTextStream()) {
    text += delta;
    onDelta?.(text);
  }

  conversationState = boundConversationState(await response.getState());
  sessionManager.setAgentState(conversationState);

  if (await response.requiresApproval()) {
    const nextPendingCalls = (await response.getPendingToolCalls()).map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));
    recordToolCalls(nextPendingCalls);
    await onApproval?.(nextPendingCalls);
  }

  return text;
};
