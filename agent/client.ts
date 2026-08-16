import { OpenRouter, callModel, stepCountIs } from "@openrouter/agent";
import type { ConversationState, StateAccessor } from "@openrouter/agent";
import { classifyError } from "./errors";
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listFilesTool,
  searchCodeTool,
  runCommandTool,
  webSearchTool,
  projectInfoTool,
} from "../tools/tools";
import { readConfig } from "../config";
import { sessionManager } from "../session";
import type { SessionToolCall } from "../session";
import { boundConversationState } from "./context";
import { shouldRequireApproval } from "../tools/tools";

const getOpenRouterInstance = () => {
  const currentConfig = readConfig();
  const apiKey = currentConfig.openRouterApiKey ?? process.env.OPENROUTER_API_KEY;
  return new OpenRouter({
    apiKey,
    retryConfig: {
      strategy: "backoff",
      backoff: {
        initialInterval: 500,
        maxInterval: 30_000,
        exponent: 1.5,
        maxElapsedTime: 120_000,
      },
      retryConnectionErrors: true,
    },
  });
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
- Refuse requests that are harmful, destructive, or that attempt to exfiltrate secrets.
- If edit_file reports that oldStr was not found, re-read the file and retry with a fresh exact snippet; never repeat the same stale edit arguments.

VERIFICATION LOOP (mandatory for every code change):
1. Discover: Before making code changes, call project_info to discover available build, type-check, test, and lint commands.
2. Edit: Make the smallest correct change to the relevant files using write_file or edit_file.
3. Verify: Run the project's check command (e.g., bun test, bunx tsc --noEmit, pytest, cargo check). Choose the narrowest scope that catches regressions.
4. Inspect & Patch: If verification returns a non-zero exit code, carefully inspect stderr/output, locate the error root cause, fix the code/tests, and re-run verification.
5. Done: Declare completion ONLY after all verification commands exit with code 0. Always summarize the changed files and the verification commands you ran along with their exit codes.

Additional verification rules:
- Never skip verification because an edit "looks correct".
- Do not mask errors with '|| true' or 'exit 0'.
- If no test command exists, run at least a type-check or syntax check appropriate for the language.
- After fixing a test failure, re-run the affected test suite to ensure no regressions were introduced.`;

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
  projectInfoTool,
] as const;

const requiresApproval = (toolCall: { name: string }): boolean =>
  shouldRequireApproval(toolCall.name, readConfig().permissionMode ?? "always-ask");

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

  try {
    const response = callModel(openrouter, {
      model,
      input: [
        { role: "developer", content: agentInstructions },
        { role: "user", content: query },
      ],
      state: conversation,
      tools,
      requireApproval: requiresApproval,
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
  } catch (error) {
    throw classifyError(error);
  }
};

export const resolvePendingToolCalls = async (
  approve: boolean,
  onDelta?: (text: string) => void,
  onApproval?: (calls: PendingToolCall[]) => Promise<void>,
) => {
  const openrouter = getOpenRouterInstance();
  const model = getActiveModel();

  try {
    const pendingCalls = conversationState?.pendingToolCalls ?? [];
    const response = callModel(openrouter, {
      model,
      input: [],
      state: conversation,
      tools,
      requireApproval: requiresApproval,
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
  } catch (error) {
    throw classifyError(error);
  }
};
