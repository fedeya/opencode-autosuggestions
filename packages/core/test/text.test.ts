import { describe, expect, test } from "bun:test"
import { clip, clipEnd, fitSuggestion, isCompletable, parseCompletion, parseFollowUp, splitNextWord } from "../src/text"

describe("clip", () => {
  test("keeps short text and cuts long text at the end or the start", () => {
    expect(clip("hello", 10)).toBe("hello")
    expect(clip("hello world", 5)).toBe("hello…")
    expect(clipEnd("hello world", 5)).toBe("…world")
  })
})

describe("isCompletable", () => {
  test("needs a few characters", () => {
    expect(isCompletable("ad")).toBe(false)
    expect(isCompletable("add")).toBe(true)
  })

  test("leaves slash commands, shell commands, and mentions to OpenCode", () => {
    expect(isCompletable("/models")).toBe(false)
    expect(isCompletable("!git status")).toBe(false)
    expect(isCompletable("review @src/ap")).toBe(false)
    expect(isCompletable("review @src/app.ts and")).toBe(true)
  })
})

describe("parseFollowUp", () => {
  test("takes the first line without quotes or prefixes", () => {
    expect(parseFollowUp('  "yes, add the tests"\nsecond line')).toBe("yes, add the tests")
    expect(parseFollowUp("Next user message: run it")).toBe("run it")
    expect(parseFollowUp("User: commit it")).toBe("commit it")
    expect(parseFollowUp("update the mock in `profile.test.ts`")).toBe("update the mock in `profile.test.ts`")
  })

  test("returns nothing for NONE, empty, or overlong replies", () => {
    expect(parseFollowUp("NONE")).toBe("")
    expect(parseFollowUp("none.")).toBe("")
    expect(parseFollowUp("   ")).toBe("")
    expect(parseFollowUp("a".repeat(201))).toBe("")
  })
})

describe("parseCompletion", () => {
  test("returns what follows the unfinished text", () => {
    expect(parseCompletion("sure but use pyt", "sure but use pytest for the tests")).toBe("est for the tests")
    expect(parseCompletion("add a health check", "add a health check endpoint\n")).toBe(" endpoint")
    expect(parseCompletion("rename it to", '"rename it to `fetchUser`"')).toBe(" `fetchUser`")
  })

  test("accepts a reply that echoes only the last line of a multi-line prompt", () => {
    expect(parseCompletion("first line\nadd a", "add a test")).toBe(" test")
  })

  test("rejects replies that do not continue the text", () => {
    expect(parseCompletion("add a test", "write a test")).toBe("")
    expect(parseCompletion("add a test", "add a test")).toBe("")
    expect(parseCompletion("add a test", "NONE")).toBe("")
    expect(parseCompletion("explain why", "explain why NONE")).toBe("")
    expect(parseCompletion("add a test", `add a test ${"x".repeat(200)}`)).toBe("")
  })
})

describe("fitSuggestion", () => {
  test("keeps the whole suggestion when it fits", () => {
    expect(fitSuggestion("yes, add them", "  ⇥ tab", 40)).toBe("yes, add them  ⇥ tab")
  })

  test("cuts the suggestion, never the hint", () => {
    expect(fitSuggestion("implement the three improvements", "  ⇥ tab", 30)).toBe("implement the three im…  ⇥ tab")
  })

  test("shows nothing when there is no useful room", () => {
    expect(fitSuggestion("anything", "  ⇥ tab", 10)).toBe("")
    expect(fitSuggestion("anything", "", 1)).toBe("")
    expect(fitSuggestion("anything", "", 4)).toBe("any…")
  })
})

describe("splitNextWord", () => {
  test("takes the next word with the spaces before it", () => {
    expect(splitNextWord(" returns the service status")).toEqual({ word: " returns", rest: " the service status" })
    expect(splitNextWord("oint that returns")).toEqual({ word: "oint", rest: " that returns" })
  })

  test("takes everything when one word is left", () => {
    expect(splitNextWord(" status")).toEqual({ word: " status", rest: "" })
    expect(splitNextWord(" status  ")).toEqual({ word: " status  ", rest: "" })
  })
})
