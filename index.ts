import { getResponse, resolvePendingToolCalls } from "./agent/client";
import type { PendingToolCall } from "./agent/client";

import {
  ASCIIFontRenderable,
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  RGBA,
  ScrollBoxRenderable,
  createCliRenderer,
} from "@opentui/core";

const renderer = await createCliRenderer();

const screen = new BoxRenderable(renderer, {
  id: "screen",
  width: "100%",
  height: "100%",
  flexDirection: "column",
  backgroundColor: "#1a1714",
});

const header = new BoxRenderable(renderer, {
  id: "header",
  width: "100%",
  height: 1,
  backgroundColor: "#252220",
  paddingX: 2,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
});

const headerLeft = new TextRenderable(renderer, {
  id: "header-left",
  content: "  wisp",
  fg: "#e8a87c",
});

const headerRight = new TextRenderable(renderer, {
  id: "header-right",
  content: "ctrl+c exit  ",
  fg: "#5c5450",
});

header.add(headerLeft);
header.add(headerRight);

const headerDivider = new BoxRenderable(renderer, {
  id: "header-divider",
  width: "100%",
  height: 1,
  backgroundColor: "#2e2a27",
});

const welcomeArea = new BoxRenderable(renderer, {
  id: "welcome-area",
  width: "100%",
  flexGrow: 1,
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: 1,
});

const logo = new ASCIIFontRenderable(renderer, {
  id: "logo",
  text: "Wisp",
  font: "shade",
  color: RGBA.fromHex("#e8a87c"),
});

const tagline = new TextRenderable(renderer, {
  id: "tagline",
  content: "an ai coding agent",
  fg: "#5c5450",
});

welcomeArea.add(logo);
welcomeArea.add(tagline);

let chatHistory: ScrollBoxRenderable | undefined;

const startChat = () => {
  if (chatHistory) return;

  welcomeArea.destroy();

  chatHistory = new ScrollBoxRenderable(renderer, {
    id: "chat-history",
    width: "100%",
    flexGrow: 1,
    paddingX: 2,
    paddingY: 1,
    scrollY: true,
    stickyScroll: true,
    stickyStart: "bottom",
    contentOptions: { flexDirection: "column", gap: 1 },
  });

  screen.insertBefore(chatHistory, inputDivider);
};

type MessageRole = "you" | "wisp" | "tool" | "approval" | "error";

const roleStyles: Record<
  MessageRole,
  { label: string; labelColor: string; fg: string }
> = {
  you: { label: "you", labelColor: "#6ba3d6", fg: "#d4cfc9" },
  wisp: { label: "wisp", labelColor: "#e8a87c", fg: "#d4cfc9" },
  tool: { label: "tool", labelColor: "#7ec8a0", fg: "#8ab89a" },
  approval: { label: "approve", labelColor: "#e8c87c", fg: "#c4b890" },
  error: { label: "error", labelColor: "#c26b6b", fg: "#b08080" },
};

interface MessageBlock {
  label: TextRenderable;
  body: TextRenderable;
  container: BoxRenderable;
}

const addBlock = (role: MessageRole, text: string): MessageBlock => {
  startChat();

  const style = roleStyles[role];
  const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const container = new BoxRenderable(renderer, {
    id: `ctr-${id}`,
    width: "100%",
    flexDirection: "column",
    gap: 0,
  });

  const label = new TextRenderable(renderer, {
    id: `lbl-${id}`,
    content: style.label,
    fg: style.labelColor,
  });

  const body = new TextRenderable(renderer, {
    id: `bod-${id}`,
    width: "100%",
    content: text,
    fg: style.fg,
    wrapMode: "word",
  });

  container.add(label);
  container.add(body);
  chatHistory!.add(container);

  return { label, body, container };
};

const inputDivider = new BoxRenderable(renderer, {
  id: "input-divider",
  width: "100%",
  height: 1,
  backgroundColor: "#2e2a27",
});

const inputArea = new BoxRenderable(renderer, {
  id: "input-area",
  width: "100%",
  height: 3,
  backgroundColor: "#1e1c19",
  paddingX: 2,
  flexDirection: "row",
  alignItems: "center",
  gap: 1,
});

const inputPromptGlyph = new TextRenderable(renderer, {
  id: "input-glyph",
  content: ">",
  fg: "#e8a87c",
});

const input = new InputRenderable(renderer, {
  id: "prompt-input",
  flexGrow: 1,
  placeholder: "Ask wisp anything…",
  textColor: "#d4cfc9",
  backgroundColor: "#1e1c19",
  focusedBackgroundColor: "#1e1c19",
  placeholderColor: "#4a4540",
  cursorColor: "#e8a87c",
});

inputArea.add(inputPromptGlyph);
inputArea.add(input);

const statusBar = new BoxRenderable(renderer, {
  id: "status-bar",
  width: "100%",
  height: 1,
  backgroundColor: "#141210",
  paddingX: 2,
  flexDirection: "row",
  alignItems: "center",
});

const statusText = new TextRenderable(renderer, {
  id: "status-text",
  content: "ready",
  fg: "#3d3935",
});

statusBar.add(statusText);

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
