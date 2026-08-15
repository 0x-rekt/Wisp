import { getResponse, resolvePendingToolCalls } from "./agent/client";
import type { PendingToolCall } from "./agent/client";

import {
  BoxRenderable,
  InputRenderableEvents,
  createCliRenderer,
} from "@opentui/core";
import { readConfig, updateConfig, getConfigPath } from "./config";
import { createChatHistory } from "./ui/chat-history";
import { createHeader } from "./ui/header";
import { createInputBar } from "./ui/input-bar";
import { createMessageBlock } from "./ui/message-block";
import type { MessageBlock } from "./ui/message-block";
import type { MessageRole } from "./ui/theme";
import { createStatusBar } from "./ui/status-bar";
import { createWelcomeArea } from "./ui/welcome";
import { createModelModal } from "./ui/model-modal";

const renderer = await createCliRenderer();

const screen = new BoxRenderable(renderer, {
  id: "screen",
  width: "100%",
  height: "100%",
  flexDirection: "column",
  backgroundColor: "#1a1714",
});

const { header, divider: headerDivider } = createHeader(renderer);
const welcomeArea = createWelcomeArea(renderer);

let chatHistory: ReturnType<typeof createChatHistory>;
let chatVisible = false;

const startChat = () => {
  if (chatVisible) return;

  welcomeArea.destroy();

  chatHistory = createChatHistory(renderer);
  chatVisible = true;

  screen.insertBefore(chatHistory, inputDivider);
};

const addBlock = (role: MessageRole, text: string): MessageBlock => {
  startChat();

  const block = createMessageBlock(renderer, role, text);
  chatHistory.add(block.container);

  return block;
};

const { inputDivider, inputArea, input } = createInputBar(renderer);
const { statusBar, statusText, updateModelDisplay } = createStatusBar(renderer);

screen.add(header);
screen.add(headerDivider);
screen.add(welcomeArea);
screen.add(inputDivider);
screen.add(inputArea);
screen.add(statusBar);

renderer.root.add(screen);

let isRequestInFlight = false;
let alwaysAllow = false;

let approvalResolver: ((value: string) => void) | null = null;
let authPromptState: "openrouter" | "tavily" | null = null;
let tempOpenRouterKey: string | undefined = undefined;

const setStatus = (text: string, color = "#3d3935") => {
  statusText.content = text;
  statusText.fg = color;
};

const askApproval = (call: PendingToolCall): Promise<string> => {
  return new Promise((resolve) => {
    const preview = JSON.stringify(call.arguments, null, 2);
    addBlock(
      "approval",
      `${call.name}\n${preview}\n\ntype  y · n · always  then press enter`,
    );
    input.placeholder = "y / n / always";
    approvalResolver = resolve;
    input.focus();
  });
};

const openModelSelector = () => {
  const modal = createModelModal(renderer, {
    onSelect: (selectedModel) => {
      modal.destroy();
      renderer.root.remove(modal.overlay);
      updateModelDisplay(selectedModel);
      addBlock("system", `Active model set to: ${selectedModel}`);
      input.focus();
    },
    onCancel: () => {
      modal.destroy();
      renderer.root.remove(modal.overlay);
      input.focus();
    },
  });

  renderer.root.add(modal.overlay);
  modal.select.focus();
};

input.on(InputRenderableEvents.ENTER, async () => {
  if (approvalResolver) {
    const answer = input.value.trim().toLowerCase();
    input.value = "";
    input.placeholder = "Ask wisp anything…";
    const resolver = approvalResolver;
    approvalResolver = null;
    resolver(answer || "n");
    return;
  }

  if (authPromptState === "openrouter") {
    tempOpenRouterKey = input.value.trim();
    input.value = "";
    authPromptState = "tavily";
    input.placeholder = "Enter Tavily API key (or press enter to skip)…";
    addBlock(
      "system",
      "OpenRouter API Key saved.\n\nNow enter your Tavily API Key for web search (optional):",
    );
    return;
  }

  if (authPromptState === "tavily") {
    const tavilyKey = input.value.trim();
    input.value = "";
    authPromptState = null;
    input.placeholder = "Ask wisp anything…";

    const updates: Record<string, string> = {};
    if (tempOpenRouterKey) updates.openRouterApiKey = tempOpenRouterKey;
    if (tavilyKey) updates.tavilyApiKey = tavilyKey;

    if (Object.keys(updates).length > 0) {
      updateConfig(updates);
      addBlock("system", `✓ API Key(s) saved to ${getConfigPath()}`);
    } else {
      addBlock("system", "No keys were entered. Config unchanged.");
    }
    tempOpenRouterKey = undefined;
    return;
  }

  const query = input.value.trim();
  if (!query || isRequestInFlight) return;

  // Slash commands handling
  if (query === "/model") {
    input.value = "";
    openModelSelector();
    return;
  }

  if (query.startsWith("/model ")) {
    input.value = "";
    const modelName = query.slice(7).trim();
    if (modelName) {
      updateConfig({ model: modelName });
      updateModelDisplay(modelName);
      addBlock("system", `Active model set to: ${modelName}`);
    } else {
      openModelSelector();
    }
    return;
  }

  if (query === "/auth") {
    input.value = "";
    authPromptState = "openrouter";
    startChat();
    addBlock(
      "system",
      "🔑 API Key Configuration Flow\n\nEnter your OpenRouter API Key (sk-or-v1-...):",
    );
    input.placeholder = "Enter OpenRouter API key…";
    return;
  }

  if (query === "/config") {
    input.value = "";
    startChat();
    const config = readConfig();
    addBlock(
      "system",
      `Config file: ${getConfigPath()}\n\n` +
        `model: ${config.model}\n` +
        `openRouterApiKey: ${config.openRouterApiKey ? "••••••••" : "(not set)"}\n` +
        `tavilyApiKey: ${config.tavilyApiKey ? "••••••••" : "(not set)"}`,
    );
    return;
  }

  startChat();
  isRequestInFlight = true;
  input.value = "";
  input.blur();
  setStatus("thinking…", "#e8a87c");

  addBlock("you", query);
  const wispBlock = addBlock("wisp", "…");

  const handleApproval = async (pendingCalls: PendingToolCall[]) => {
    for (const call of pendingCalls) {
      let approved: string;

      if (alwaysAllow) {
        approved = "y";
      } else {
        approved = await askApproval(call);
        if (approved === "always") alwaysAllow = true;
      }

      const isApproved = approved === "y" || approved === "always";
      setStatus(
        isApproved ? "running tool…" : "rejected",
        isApproved ? "#7ec8a0" : "#c26b6b",
      );

      const toolBlock = addBlock(
        "tool",
        isApproved ? `running ${call.name}…` : `rejected ${call.name}`,
      );

      const followUp = await resolvePendingToolCalls(
        isApproved,
        (partialText) => {
          wispBlock.body.content = partialText;
          wispBlock.body.fg = "#d4cfc9";
        },
      );

      toolBlock.body.content = isApproved
        ? `✓ ${call.name} done`
        : `✗ ${call.name} rejected`;
      toolBlock.body.fg = isApproved ? "#7ec8a0" : "#c26b6b";

      if (followUp) {
        wispBlock.body.content = followUp;
        wispBlock.body.fg = "#d4cfc9";
      }
    }
  };

  try {
    const answer = await getResponse(
      query,
      (partialText) => {
        wispBlock.body.content = partialText;
        wispBlock.body.fg = "#d4cfc9";
      },
      handleApproval,
    );

    if (answer) {
      wispBlock.body.content = answer;
      wispBlock.body.fg = "#d4cfc9";
    }

    setStatus("ready", "#3d3935");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    wispBlock.body.content = `error: ${message}`;
    wispBlock.body.fg = "#c26b6b";
    wispBlock.label.fg = "#c26b6b";
    setStatus("error", "#c26b6b");
  } finally {
    isRequestInFlight = false;
    input.focus();
  }
});

input.focus();
