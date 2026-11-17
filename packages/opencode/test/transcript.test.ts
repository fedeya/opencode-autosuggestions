import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client"
import { formatTranscript, lastAssistantModel } from "../src/transcript"

const user = (text: string) => ({ type: "user", id: "u", time: { created: 0 }, text }) as SessionMessageInfo
const assistant = (content: unknown[], model = { providerID: "anthropic", id: "claude-haiku-5-5" }) =>
  ({ type: "assistant", id: "a", time: { created: 0 }, agent: "build", model, content }) as SessionMessageInfo

const limits = { maxMessages: 8, maxChars: 6000 }

describe("formatTranscript", () => {
  test("lists user text, assistant text, and tool names without their output", () => {
    const messages = [
      user("create hello.py"),
      assistant([
        { type: "tool", id: "t1", name: "write", state: { status: "completed", output: "secret output" } },
        { type: "tool", id: "t2", name: "write", state: { status: "streaming", input: '{"pa' } },
        { type: "reasoning", text: "thinking" },
        { type: "text", text: "Created hello.py. Want tests?" },
      ]),
    ]
    expect(formatTranscript(messages, limits)).toBe(
      "USER: create hello.py\n\nASSISTANT (used tools: write)\n\nASSISTANT: Created hello.py. Want tests?",
    )
  })

  test("names the files that file tools touched, relative to the session directory", () => {
    const messages = [
      assistant([
        { type: "tool", id: "t1", name: "read", state: { status: "completed", input: { path: "/repo/src/app.ts" } } },
        { type: "tool", id: "t2", name: "edit", state: { status: "completed", input: { path: "/repo/src/app.ts" } } },
        {
          type: "tool",
          id: "t3",
          name: "patch",
          state: {
            status: "completed",
            input: { patchText: "*** Begin Patch\n*** Add File: /repo/test/app.test.ts\n+x\n*** End Patch" },
          },
        },
        { type: "tool", id: "t4", name: "shell", state: { status: "completed", input: { command: "npm test" } } },
        {
          type: "tool",
          id: "t5",
          name: "read",
          state: { status: "completed", input: { path: "/elsewhere/lib/x.ts" } },
        },
        { type: "text", text: "Done." },
      ]),
    ]
    expect(formatTranscript(messages, { ...limits, directory: "/repo" })).toBe(
      "ASSISTANT (used tools: read src/app.ts, edit src/app.ts, patch test/app.test.ts, shell, read lib/x.ts)\n\nASSISTANT: Done.",
    )
  })

  test("keeps only the latest lines and characters", () => {
    const messages = [user("one"), user("two"), user("three")]
    expect(formatTranscript(messages, { maxMessages: 2, maxChars: 6000 })).toBe("USER: two\n\nUSER: three")
    expect(formatTranscript(messages, { maxMessages: 8, maxChars: 5 })).toBe("…three")
  })

  test("skips empty messages and other message kinds", () => {
    const messages = [user("   "), { type: "idle" } as unknown as SessionMessageInfo, assistant([])]
    expect(formatTranscript(messages, limits)).toBe("")
  })
})

describe("lastAssistantModel", () => {
  test("returns the model of the latest assistant message", () => {
    const messages = [
      assistant([], { providerID: "anthropic", id: "claude-opus-5-5" }),
      assistant([], { providerID: "openai", id: "gpt-6-luna" }),
      user("next"),
    ]
    expect(lastAssistantModel(messages)).toEqual({ providerID: "openai", id: "gpt-6-luna" })
    expect(lastAssistantModel([user("hi")])).toBeUndefined()
  })
})
