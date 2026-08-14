import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { MessageRole } from "./theme";
import { roleStyles } from "./theme";

export interface MessageBlock {
  label: TextRenderable;
  body: TextRenderable;
  container: BoxRenderable;
}

export const createMessageBlock = (
  renderer: ConstructorParameters<typeof BoxRenderable>[0],
  role: MessageRole,
  text: string,
): MessageBlock => {
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

  return { label, body, container };
};
