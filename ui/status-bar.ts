import { BoxRenderable, TextRenderable } from "@opentui/core";

export const createStatusBar = (renderer: ConstructorParameters<typeof BoxRenderable>[0]) => {
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

  return { statusBar, statusText };
};
