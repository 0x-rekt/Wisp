import { BoxRenderable, TextRenderable } from "@opentui/core";
import { readConfig } from "../config";

export const createStatusBar = (
  renderer: ConstructorParameters<typeof BoxRenderable>[0],
) => {
  const statusBar = new BoxRenderable(renderer, {
    id: "status-bar",
    width: "100%",
    height: 1,
    backgroundColor: "#141210",
    paddingX: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  });

  const statusText = new TextRenderable(renderer, {
    id: "status-text",
    content: "ready",
    fg: "#3d3935",
  });

  const modelText = new TextRenderable(renderer, {
    id: "model-text",
    content: `model: ${readConfig().model}`,
    fg: "#7d7871",
  });

  statusBar.add(statusText);
  statusBar.add(modelText);

  const updateModelDisplay = (modelName?: string) => {
    const currentModel = modelName ?? readConfig().model;
    modelText.content = `model: ${currentModel}`;
  };

  return { statusBar, statusText, modelText, updateModelDisplay };
};
