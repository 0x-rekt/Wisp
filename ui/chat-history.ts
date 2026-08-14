import { BoxRenderable, ScrollBoxRenderable } from "@opentui/core";

export const createChatHistory = (renderer: ConstructorParameters<typeof BoxRenderable>[0]) =>
  new ScrollBoxRenderable(renderer, {
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
