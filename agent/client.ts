import { OpenRouter, callModel, stepCountIs } from "@openrouter/agent";
import type { ConversationState, StateAccessor } from "@openrouter/agent";
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listFilesTool,
  searchCodeTool,
} from "../tools/tools";

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

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
  const response = callModel(openrouter, {
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    input: query,
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
  const pendingCalls = conversationState?.pendingToolCalls ?? [];
  const response = callModel(openrouter, {
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
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
