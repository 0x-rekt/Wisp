import { getResponse, resolvePendingToolCalls } from "./agent/client";
import type { PendingToolCall } from "./agent/client";

import {
  BoxRenderable,
  InputRenderableEvents,
  createCliRenderer,
} from "@opentui/core";
import { createChatHistory } from "./ui/chat-history";
import { createHeader } from "./ui/header";
import { createInputBar } from "./ui/input-bar";
import { createMessageBlock } from "./ui/message-block";
import type { MessageBlock } from "./ui/message-block";
import type { MessageRole } from "./ui/theme";
import { createStatusBar } from "./ui/status-bar";
import { createWelcomeArea } from "./ui/welcome";

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
const { statusBar, statusText } = createStatusBar(renderer);

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
  const query = input.value.trim();
  if (!query || isRequestInFlight) return;

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
