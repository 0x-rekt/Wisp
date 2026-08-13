import { getResponse } from "./agent/client";

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
  justifyContent: "center",
  alignItems: "center",
  gap: 2,
});

const title = new ASCIIFontRenderable(renderer, {
  id: "title",
  text: "Wisp",
  font: "shade",
  color: RGBA.fromInts(255, 255, 255, 255),
});

const inputBox = new BoxRenderable(renderer, {
  id: "prompt-box",
  width: 40,
  height: 3,
  border: true,
  borderStyle: "rounded",
  borderColor: "#6ea8d7",
  backgroundColor: "#10151c",
  paddingX: 1,
});

const input = new InputRenderable(renderer, {
  id: "prompt-input",
  width: "100%",
  placeholder: "What can I help with?",
  textColor: "#ffffff",
  backgroundColor: "#10151c",
  focusedBackgroundColor: "#182431",
  placeholderColor: "#8aa0b5",
  cursorColor: "#ffffff",
});

inputBox.add(input);
screen.add(title);
screen.add(inputBox);

let chatHistory: ScrollBoxRenderable | undefined;
let conversation: TextRenderable | undefined;

const startChat = () => {
  if (chatHistory && conversation) {
    return;
  }

  title.destroy();
  screen.justifyContent = "flex-start";
  screen.alignItems = "stretch";
  screen.paddingX = 1;
  screen.gap = 1;
  inputBox.width = "100%";

  chatHistory = new ScrollBoxRenderable(renderer, {
    id: "chat-history",
    width: "100%",
    flexGrow: 1,
    paddingX: 1,
    scrollY: true,
    stickyScroll: true,
    stickyStart: "bottom",
    contentOptions: { flexDirection: "column" },
  });

  conversation = new TextRenderable(renderer, {
    id: "conversation",
    width: "100%",
    content: "",
    fg: "#ffffff",
    wrapMode: "word",
  });

  chatHistory.add(conversation);
  screen.insertBefore(chatHistory, inputBox);
};

const addMessage = (speaker: string, message: string, color: string) => {
  if (!conversation) {
    return;
  }

  const separator = conversation.plainText ? "\n\n" : "";
  conversation.content = conversation.plainText + separator + speaker + "\n" + message;
  conversation.fg = color;
};
renderer.root.add(screen);

let isRequestInFlight = false;

input.on(InputRenderableEvents.ENTER, async () => {
  const query = input.value.trim();

  if (!query || isRequestInFlight) {
    return;
  }

  startChat();
  isRequestInFlight = true;
  input.value = "";
  input.blur();
  addMessage("You", query, "#9ecbff");
  const historyBeforeResponse = conversation?.plainText ?? "";
  addMessage("Wisp", "Thinking…", "#a0a0a0");

  let receivedDelta = false;

  try {
    const answer = await getResponse(query, (partialText) => {
      receivedDelta = true;

      if (conversation) {
        conversation.content = historyBeforeResponse + "\n\nWisp\n" + partialText;
        conversation.fg = "#ffffff";
      }
    });

    if (!receivedDelta && conversation) {
      conversation.content = historyBeforeResponse + "\n\nWisp\n" + answer;
      conversation.fg = "#ffffff";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (conversation) {
      conversation.content =
        historyBeforeResponse +
        "\n\nWisp\nUnable to get a model response: " +
        message;
      conversation.fg = "#ff8080";
    }
  } finally {
    isRequestInFlight = false;
    input.focus();
  }
});

input.focus();
