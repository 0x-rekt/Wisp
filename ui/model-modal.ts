import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core";
import { readConfig, updateConfig } from "../config";

export const PRESET_MODELS = [
  {
    name: "Nemotron 3 Super (Free)",
    description: "nvidia/nemotron-3-super-120b-a12b:free",
    value: "nvidia/nemotron-3-super-120b-a12b:free",
  },
  {
    name: "Nemotron 3 Ultra 550B (Free)",
    description: "nvidia/nemotron-3-ultra-550b-a55b:free",
    value: "nvidia/nemotron-3-ultra-550b-a55b:free",
  },
  {
    name: "Nemotron 3.5 Lightning (Free)",
    description: "nvidia/nemotron-3.5-lightning:free",
    value: "nvidia/nemotron-3.5-lightning:free",
  },
  {
    name: "Gemma 4 31B IT (Free)",
    description: "google/gemma-4-31b-it:free",
    value: "google/gemma-4-31b-it:free",
  },
  {
    name: "Gemma 4 26B A4B IT (Free)",
    description: "google/gemma-4-26b-a4b-it:free",
    value: "google/gemma-4-26b-a4b-it:free",
  },
  {
    name: "GPT-OSS 20B (Free)",
    description: "openai/gpt-oss-20b:free",
    value: "openai/gpt-oss-20b:free",
  },
  {
    name: "Claude Fable 5",
    description: "anthropic/claude-fable-5",
    value: "anthropic/claude-fable-5",
  },
  {
    name: "Claude Opus 5",
    description: "anthropic/claude-opus-5",
    value: "anthropic/claude-opus-5",
  },
  {
    name: "Claude Sonnet 5",
    description: "anthropic/claude-sonnet-5",
    value: "anthropic/claude-sonnet-5",
  },
  {
    name: "Claude Opus 4.8",
    description: "anthropic/claude-opus-4.8",
    value: "anthropic/claude-opus-4.8",
  },
  {
    name: "Claude Opus 4.7",
    description: "anthropic/claude-opus-4.7",
    value: "anthropic/claude-opus-4.7",
  },
  {
    name: "GPT-5.6 Terra",
    description: "openai/gpt-5.6-terra",
    value: "openai/gpt-5.6-terra",
  },
  {
    name: "GPT-5.6 Luna",
    description: "openai/gpt-5.6-luna",
    value: "openai/gpt-5.6-luna",
  },
  {
    name: "GPT-5.5",
    description: "openai/gpt-5.5",
    value: "openai/gpt-5.5",
  },
  {
    name: "GPT-5.4 mini",
    description: "openai/gpt-5.4-mini",
    value: "openai/gpt-5.4-mini",
  },
  {
    name: "Gemini 3.7 Flash",
    description: "google/gemini-3.7-flash",
    value: "google/gemini-3.7-flash",
  },
  {
    name: "Gemini 3.6 Flash",
    description: "google/gemini-3.6-flash",
    value: "google/gemini-3.6-flash",
  },
  {
    name: "Gemini 3.5 Flash",
    description: "google/gemini-3.5-flash",
    value: "google/gemini-3.5-flash",
  },
  {
    name: "Qwen3.8-max",
    description: "qwen/qwen3.8-max",
    value: "qwen/qwen3.8-max",
  },
  {
    name: "Qwen3.7-max",
    description: "qwen/qwen3.7-max",
    value: "qwen/qwen3.7-max",
  },
  {
    name: "Qwen3.6-plus",
    description: "qwen/qwen3.6-plus",
    value: "qwen/qwen3.6-plus",
  },
];

export interface ModelModalOptions {
  onSelect: (selectedModel: string) => void;
  onCancel: () => void;
}

export const createModelModal = (
  renderer: ConstructorParameters<typeof BoxRenderable>[0],
  options: ModelModalOptions,
) => {
  const currentModel = readConfig().model;
  let initialIndex = PRESET_MODELS.findIndex((m) => m.value === currentModel);
  if (initialIndex === -1) initialIndex = 0;

  const overlay = new BoxRenderable(renderer, {
    id: "model-modal-overlay",
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
    id: "model-modal-dialog",
    width: 65,
    height: 14,
    flexDirection: "column",
    backgroundColor: "#221e1a",
    borderStyle: "single",
    borderColor: "#e8a87c",
    paddingX: 2,
    paddingY: 1,
    gap: 1,
  });

  const title = new TextRenderable(renderer, {
    id: "model-modal-title",
    content: "Select Active LLM Model (/model)",
    fg: "#e8a87c",
  });

  const instructions = new TextRenderable(renderer, {
    id: "model-modal-instructions",
    content: "↑/↓ navigate · Enter select · Esc cancel",
    fg: "#7d7871",
  });

  const select = new SelectRenderable(renderer, {
    id: "model-select",
    width: "100%",
    height: 8,
    options: PRESET_MODELS,
    selectedIndex: initialIndex,
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

  select.onKeyDown = (key: KeyEvent) => {
    if (key.name === "escape" || key.sequence === "\x1b") {
      options.onCancel();
    }
  };

  dialog.add(title);
  dialog.add(instructions);
  dialog.add(select);
  overlay.add(dialog);

  select.on(SelectRenderableEvents.ITEM_SELECTED, () => {
    const selected = select.getSelectedOption();
    if (selected && selected.value) {
      updateConfig({ model: selected.value });
      options.onSelect(selected.value);
    }
  });

  const destroy = () => {
    overlay.destroy();
  };

  return { overlay, select, destroy };
};
