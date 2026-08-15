import { getResponse, resolvePendingToolCalls } from "./agent/client";
import type { PendingToolCall } from "./agent/client";

import {
  BoxRenderable,
  DiffRenderable,
  InputRenderableEvents,
  SyntaxStyle,
  TextRenderable,
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
import { formatApprovalPreview } from "./tools/format-approval";
import type { ApprovalPreview } from "./tools/format-approval";

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

const diffSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: "#d4cfc9" },
  keyword: { fg: "#e8a87c", bold: true },
  string: { fg: "#7ec8a0" },
  comment: { fg: "#6b6560" },
  number: { fg: "#c8a0e8" },
  type: { fg: "#6ba3d6" },
});

const addApprovalBlock = (preview: ApprovalPreview): void => {
  startChat();

  const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const container = new BoxRenderable(renderer, {
    id: `ctr-${id}`,
    width: "100%",
    flexDirection: "column",
    gap: 0,
  });

  const label = new TextRenderable(renderer, {
    id: `lbl-${id}`,
    content: "approve",
    fg: "#e8c87c",
  });
  container.add(label);

  const headerText = preview.kind === "diff" ? preview.header : preview.text;
  const header = new TextRenderable(renderer, {
    id: `hdr-${id}`,
    width: "100%",
    content: headerText,
    fg: "#c4b890",
    wrapMode: "word",
  });
  container.add(header);

  if (preview.kind === "diff" && preview.diff) {
    const diffWidget = new DiffRenderable(renderer, {
      id: `diff-${id}`,
      width: "100%",
      diff: preview.diff,
      view: "unified",
      filetype: preview.filetype,
      syntaxStyle: diffSyntaxStyle,
      showLineNumbers: true,
      wrapMode: "word",
      addedBg: "#1a2e1a",
      removedBg: "#2e1a1a",
      contextBg: "#1a1714",
      addedSignColor: "#7ec8a0",
      removedSignColor: "#c26b6b",
      lineNumberFg: "#6b6560",
      lineNumberBg: "#1a1714",
    });
    container.add(diffWidget);
  }

  const prompt = new TextRenderable(renderer, {
    id: `pmt-${id}`,
    content: `\n${preview.prompt}  y · n · always`,
    fg: "#c4b890",
  });
  container.add(prompt);

  chatHistory.add(container);
};

const askApproval = (call: PendingToolCall): Promise<string> => {
  return new Promise((resolve) => {
    const preview = formatApprovalPreview(call.name, call.arguments);
    addApprovalBlock(preview);
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
