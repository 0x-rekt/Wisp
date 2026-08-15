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
- If a request is ambiguous and blocks progress, ask a focused clarification instead of guessing.
- Keep working until the request is satisfied or you can clearly explain the blocker.
- When the task is complete, summarize the changed files and any verification you performed.
- Refuse requests that are harmful, destructive, or that attempt to exfiltrate secrets.`;

let conversationState: ConversationState | null = null;

const conversation: StateAccessor = {
  load: async () => conversationState,
  save: async (state) => {
    conversationState = state;
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

export const getResponse = async (
  query: string,
  onDelta?: (text: string) => void,
  onApproval?: (calls: PendingToolCall[]) => Promise<void>,
) => {
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

  conversationState = await response.getState();

  if (await response.requiresApproval()) {
    const pendingCalls = (await response.getPendingToolCalls()).map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));
    await onApproval?.(pendingCalls);
  }

  return text;
};

export const resolvePendingToolCalls = async (
  approve: boolean,
  onDelta?: (text: string) => void,
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

  conversationState = await response.getState();

  return text;
};
