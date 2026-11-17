import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client"
import { endedCleanly } from "../src/turn"

const user = { type: "user", id: "u", time: { created: 0 }, text: "hi" } as SessionMessageInfo
const answer = (fields: Record<string, unknown> = {}) =>
  ({
    type: "assistant",
    id: "a",
    time: { created: 0 },
    agent: "build",
    model: { providerID: "anthropic", id: "claude-haiku-5-5" },
    content: [],
    finish: "stop",
    ...fields,
  }) as SessionMessageInfo
const idle = { type: "idle" } as unknown as SessionMessageInfo

describe("endedCleanly", () => {
  test("is true when the latest answer finished normally", () => {
    expect(endedCleanly([user, answer()])).toBe(true)
    expect(endedCleanly([user, answer(), idle])).toBe(true)
  })

  test("is false after an error or a cut-off answer", () => {
    expect(endedCleanly([user, answer({ finish: "error" })])).toBe(false)
    expect(endedCleanly([user, answer({ finish: "length" })])).toBe(false)
    expect(endedCleanly([user, answer({ error: { type: "provider", message: "overloaded" } })])).toBe(false)
  })

  test("is false when the user already wrote again, or there is no answer", () => {
    expect(endedCleanly([user, answer(), user])).toBe(false)
    expect(endedCleanly([user])).toBe(false)
    expect(endedCleanly([])).toBe(false)
  })
})
