import { OpenRouter, callModel } from "@openrouter/agent";
import type { ConversationState, StateAccessor } from "@openrouter/agent";

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

let conversationState: ConversationState | null = null;

const conversation: StateAccessor = {
  load: async () => conversationState,
  save: async (state) => {
    conversationState = state;
  },
};

export const getResponse = async (query: string) => {
  const response = callModel(openrouter, {
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    input: query,
    state: conversation,
  });

  return response.getText();
};
