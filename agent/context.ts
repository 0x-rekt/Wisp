import type { ConversationState } from "@openrouter/agent";

const MAX_MESSAGE_CHARS = 300_000;
const MAX_STRING_CHARS = 50_000;

type ConversationMessage = {
  role?: string;
  type?: string;
};

const messageSize = (message: unknown): number =>
  JSON.stringify(message).length;

const compactValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}\n[content truncated by Wisp]`
      : value;
  }
  if (Array.isArray(value)) return value.map(compactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, compactValue(entry)]),
    );
  }
  return value;
};

const isTurnBoundary = (message: ConversationMessage): boolean =>
  message.role === "user";

export const boundConversationState = <T extends ConversationState>(
  state: T | null,
): T | null => {
  if (!state || !Array.isArray(state.messages)) return state;

  const messages = state.messages as unknown[];
  const totalSize = messages.reduce<number>(
    (total, message) => total + messageSize(message),
    0,
  );
  if (totalSize <= MAX_MESSAGE_CHARS) return state;

  const firstDeveloper = messages.find(
    (message) => (message as ConversationMessage).role === "developer",
  );
  const recent: unknown[] = [];
  let size = firstDeveloper ? messageSize(firstDeveloper) : 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const nextSize = messageSize(message);
    if (size + nextSize > MAX_MESSAGE_CHARS) {
      if (recent.length > 0) break;
      const compacted = compactValue(message);
      recent.unshift(compacted);
      size += messageSize(compacted);
      break;
    }
    recent.unshift(message);
    size += nextSize;
  }

  const boundaryIndex = recent.findIndex((message) =>
    isTurnBoundary(message as ConversationMessage),
  );
  const boundedMessages = boundaryIndex > 0 ? recent.slice(boundaryIndex) : recent;
  const withDeveloper = firstDeveloper &&
    (boundedMessages[0] as ConversationMessage | undefined)?.role !== "developer"
    ? [firstDeveloper, ...boundedMessages]
    : boundedMessages;

  return {
    ...state,
    messages: withDeveloper,
    previousResponseId: undefined,
  } as T;
};
