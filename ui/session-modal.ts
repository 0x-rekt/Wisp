import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core";
import type { SessionData } from "../session";

export interface SessionModalOptions {
  onCopy: (session: SessionData) => void;
  onCancel: () => void;
}

export const createSessionModal = (
  renderer: ConstructorParameters<typeof BoxRenderable>[0],
  sessions: SessionData[],
  options: SessionModalOptions,
) => {
  const overlay = new BoxRenderable(renderer, {
    id: "session-modal-overlay",
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#100e0d88",
    zIndex: 100,
  });

  const dialog = new BoxRenderable(renderer, {
    id: "session-modal-dialog",
    width: 82,
    height: Math.min(22, sessions.length + 8),
    flexDirection: "column",
    backgroundColor: "#221e1a",
    borderStyle: "single",
    borderColor: "#e8a87c",
    paddingX: 2,
    paddingY: 1,
    gap: 1,
  });

  const title = new TextRenderable(renderer, {
    id: "session-modal-title",
    content: "Select a session to copy",
    fg: "#e8a87c",
  });

  const instructions = new TextRenderable(renderer, {
    id: "session-modal-instructions",
    content: "↑/↓ select · Ctrl/Cmd+C copy · Enter copy · Esc cancel",
    fg: "#7d7871",
  });

  const select = new SelectRenderable(renderer, {
    id: "session-select",
    width: "100%",
    height: Math.min(16, Math.max(4, sessions.length)),
    options: sessions.map((session) => ({
      name: session.id,
      value: session.id,
      description: `${session.status} · ${session.model} · ${session.prompts[0] ?? "(no prompts)"}`,
    })),
    backgroundColor: "#221e1a",
    textColor: "#d4cfc9",
    focusedBackgroundColor: "#2a2520",
    focusedTextColor: "#ffffff",
    selectedBackgroundColor: "#3d322a",
    selectedTextColor: "#e8a87c",
    descriptionColor: "#7d7871",
    selectedDescriptionColor: "#c2b8ae",
    showDescription: true,
    showSelectionIndicator: true,
  });

  const copySelected = () => {
    const selected = select.getSelectedOption();
    const session = sessions.find((item) => item.id === selected?.value);
    if (session) options.onCopy(session);
  };

  select.onKeyDown = (key: KeyEvent) => {
    if (key.name === "escape" || key.sequence === "\x1b") {
      options.onCancel();
      return;
    }

    const isCopyKey =
      key.name.toLowerCase() === "c" &&
      (key.ctrl || key.meta || key.option);
    if (isCopyKey) {
      key.preventDefault();
      copySelected();
    }
  };

  select.on(SelectRenderableEvents.ITEM_SELECTED, copySelected);

  dialog.add(title);
  dialog.add(instructions);
  dialog.add(select);
  overlay.add(dialog);

  const destroy = () => overlay.destroy();

  return { overlay, select, destroy };
};
