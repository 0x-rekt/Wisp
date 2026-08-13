import {
  ASCIIFontRenderable,
  BoxRenderable,
  InputRenderable,
  RGBA,
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
  borderColor: "#808080",
  paddingX: 1,
});

const input = new InputRenderable(renderer, {
  id: "prompt-input",
  width: "100%",
  placeholder: "What can I help with?",
  textColor: "#ffffff",
  cursorColor: "#ffffff",
});

inputBox.add(input);
screen.add(title);
screen.add(inputBox);
renderer.root.add(screen);
input.focus();
