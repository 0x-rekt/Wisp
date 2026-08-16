import { describe, expect, it } from "bun:test";
import type { ConversationState } from "@openrouter/agent";
import { boundConversationState } from "../agent/context";

describe("conversation context bounds", () => {
  it("keeps recent messages when state is oversized", () => {
    const state = {
      version: 1,
      id: "conversation",
      messages: [
        { role: "developer", content: "instructions" },
        { role: "user", content: "old".repeat(180000) },
        { role: "assistant", content: "old response" },
        { role: "user", content: "recent request" },
        { role: "assistant", content: "recent response" },
      ],
      status: "in_progress" as const,
      createdAt: 1,
      updatedAt: 1,
      previousResponseId: "response-id",
    };

    const bounded = boundConversationState(
      state as unknown as ConversationState,
    );

    expect(JSON.stringify(bounded).length).toBeLessThan(300_000);
    expect(bounded?.messages).toEqual([
      { role: "developer", content: "instructions" },
      { role: "user", content: "recent request" },
      { role: "assistant", content: "recent response" },
    ]);
    expect(bounded?.previousResponseId).toBeUndefined();
  });

  it("leaves small state unchanged", () => {
    const state = {
      version: 1,
      id: "conversation",
      messages: [{ role: "user", content: "hello" }],
      status: "in_progress" as const,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(
      boundConversationState(state as unknown as ConversationState),
    ).toBe(state as unknown as ConversationState);
  });

  it("truncates a single oversized message", () => {
    const state = {
      version: 1,
      id: "conversation",
      messages: [{ role: "user", content: "large".repeat(1000000) }],
      status: "in_progress" as const,
      createdAt: 1,
      updatedAt: 1,
    };

    const bounded = boundConversationState(
      state as unknown as ConversationState,
    );

    expect(JSON.stringify(bounded).length).toBeLessThan(300_000);
    expect(JSON.stringify(bounded)).toContain("content truncated by Wisp");
  });
});
