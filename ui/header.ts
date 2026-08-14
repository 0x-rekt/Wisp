import { BoxRenderable, TextRenderable } from "@opentui/core";

export const createHeader = (renderer: ConstructorParameters<typeof BoxRenderable>[0]) => {
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

  const left = new TextRenderable(renderer, {
    id: "header-left",
    content: "  wisp",
    fg: "#e8a87c",
  });

  const right = new TextRenderable(renderer, {
    id: "header-right",
    content: "ctrl+c exit  ",
    fg: "#5c5450",
  });

  header.add(left);
  header.add(right);

  const divider = new BoxRenderable(renderer, {
    id: "header-divider",
    width: "100%",
    height: 1,
    backgroundColor: "#2e2a27",
  });

  return { header, divider };
};
