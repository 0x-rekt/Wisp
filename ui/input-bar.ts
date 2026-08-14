import { BoxRenderable, InputRenderable, InputRenderableEvents, TextRenderable } from "@opentui/core";

export const createInputBar = (renderer: ConstructorParameters<typeof BoxRenderable>[0]) => {
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

  return {
    inputDivider,
    inputArea,
    input,
    inputPromptGlyph,
    InputRenderableEvents,
  };
};
