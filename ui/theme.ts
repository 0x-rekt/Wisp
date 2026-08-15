export type MessageRole = "you" | "wisp" | "tool" | "approval" | "error" | "system";

export const roleStyles: Record<
  MessageRole,
  { label: string; labelColor: string; fg: string }
> = {
  you: { label: "you", labelColor: "#6ba3d6", fg: "#d4cfc9" },
  wisp: { label: "wisp", labelColor: "#e8a87c", fg: "#d4cfc9" },
  tool: { label: "tool", labelColor: "#7ec8a0", fg: "#8ab89a" },
  approval: { label: "approve", labelColor: "#e8c87c", fg: "#c4b890" },
  error: { label: "error", labelColor: "#c26b6b", fg: "#b08080" },
  system: { label: "system", labelColor: "#9c8e85", fg: "#b8ada6" },
};
