import { describe, expect, test } from "bun:test"
import {
  mergeAssistantMessages,
  reorderAssistantToolUseBlocks,
} from "../src/utils/messages.js"
import type { AssistantMessage } from "../src/types/message.js"

const tu = (id: string) => ({
  type: "tool_use" as const,
  id,
  name: "TaskCreate",
  input: {},
})
const text = (s: string) => ({
  type: "text" as const,
  text: s,
  citations: [],
})
const thinking = (s: string) => ({
  type: "thinking" as const,
  thinking: s,
  signature: "",
})
const redactedThinking = (data: string) => ({
  type: "redacted_thinking" as const,
  data,
})

describe("reorderAssistantToolUseBlocks", () => {
  test("no-op for content with 0 tool_use", () => {
    const content = [thinking("t"), text("hello")]
    expect(reorderAssistantToolUseBlocks(content)).toBe(content)
  })

  test("no-op for content with 1 tool_use", () => {
    const content = [thinking("t"), text("a"), tu("1"), text("b")]
    expect(reorderAssistantToolUseBlocks(content)).toBe(content)
  })

  test("no-op when tool_use blocks are already contiguous", () => {
    const content = [thinking("t"), tu("1"), tu("2"), tu("3"), text("after")]
    expect(reorderAssistantToolUseBlocks(content)).toBe(content)
  })

  test("hoists interleaved text out of the tool_use cluster (Bedrock bug case)", () => {
    // The exact pattern from CLIENT_TOOL_USE_BUG_REPORT.md messages[31].
    const content = [
      thinking("planning"),
      tu("a"),
      tu("b"),
      tu("c"),
      tu("d"),
      text("brief explanation"),
      tu("e"),
      redactedThinking("zzz"),
    ]
    const out = reorderAssistantToolUseBlocks(content)
    expect(out.map((b) => b.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_use",
      "tool_use",
      "tool_use",
      "tool_use",
      "text",
      "redacted_thinking",
    ])
    // tool_use ids preserved in original order — downstream tool_result
    // pairing relies on this.
    expect(
      out
        .filter((b): b is ReturnType<typeof tu> => b.type === "tool_use")
        .map((b) => b.id),
    ).toEqual(["a", "b", "c", "d", "e"])
  })

  test("preserves head/tail blocks outside the tool_use window", () => {
    const content = [
      thinking("head1"),
      text("head2"),
      tu("a"),
      text("middle"),
      tu("b"),
      text("tail1"),
      redactedThinking("tail2"),
    ]
    const out = reorderAssistantToolUseBlocks(content)
    // head stays in place
    expect(out[0]).toEqual(thinking("head1"))
    expect(out[1]).toEqual(text("head2"))
    // tool_uses become contiguous
    expect(out[2]!.type).toBe("tool_use")
    expect(out[3]!.type).toBe("tool_use")
    // displaced text follows the tool_use cluster
    expect(out[4]).toEqual(text("middle"))
    // tail preserved
    expect(out[5]).toEqual(text("tail1"))
    expect(out[6]).toEqual(redactedThinking("tail2"))
  })

  test("does not drop any blocks", () => {
    const content = [
      tu("1"),
      thinking("mid-thought"),
      tu("2"),
      text("explain"),
      tu("3"),
    ]
    const out = reorderAssistantToolUseBlocks(content)
    expect(out.length).toBe(content.length)
    // every original block still present (by reference equality where applicable)
    for (const block of content) {
      expect(out).toContain(block)
    }
  })

  test("is idempotent", () => {
    const content = [
      tu("a"),
      tu("b"),
      text("explain"),
      tu("c"),
    ]
    const once = reorderAssistantToolUseBlocks(content)
    const twice = reorderAssistantToolUseBlocks(once)
    expect(twice).toBe(once)
  })
})

describe("mergeAssistantMessages reordering", () => {
  const makeAsst = (
    id: string,
    content: AssistantMessage["message"]["content"],
  ): AssistantMessage =>
    ({
      type: "assistant",
      uuid: `uuid-${id}` as AssistantMessage["uuid"],
      timestamp: "2026-05-23T00:00:00.000Z",
      message: {
        id: `msg-${id}`,
        role: "assistant",
        type: "message",
        model: "claude-opus-4-7",
        content,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 } as never,
      },
    }) as unknown as AssistantMessage

  test("reorders interleaved text after concat", () => {
    // Simulates the streaming case: each content_block_stop produces its own
    // AssistantMessage, then normalizeMessagesForAPI merges them by message.id.
    const a = makeAsst("x", [thinking("t"), tu("a"), tu("b"), tu("c"), tu("d"), text("aside")])
    const b = makeAsst("x", [tu("e"), redactedThinking("zzz")])
    const merged = mergeAssistantMessages(a, b)
    expect(merged.message.content.map((c) => c.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_use",
      "tool_use",
      "tool_use",
      "tool_use",
      "text",
      "redacted_thinking",
    ])
  })

  test("is a no-op when concat result is already valid", () => {
    const a = makeAsst("x", [thinking("t"), tu("a"), tu("b")])
    const b = makeAsst("x", [tu("c"), text("after")])
    const merged = mergeAssistantMessages(a, b)
    expect(merged.message.content.map((c) => c.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_use",
      "tool_use",
      "text",
    ])
  })
})
