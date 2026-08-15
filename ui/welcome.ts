import {
  ASCIIFontRenderable,
  BoxRenderable,
  RGBA,
  TextRenderable,
} from "@opentui/core";

export const createWelcomeArea = (
  renderer: ConstructorParameters<typeof BoxRenderable>[0],
) => {
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

  const hints = new TextRenderable(renderer, {
    id: "hints",
    content: "slash commands: /model · /auth · /config",
    fg: "#3d3935",
  });

  welcomeArea.add(logo);
  welcomeArea.add(tagline);
  welcomeArea.add(hints);

  return welcomeArea;
};
