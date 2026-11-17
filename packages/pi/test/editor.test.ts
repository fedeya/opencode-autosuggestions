import { expect, test } from "bun:test"
import { CURSOR_MARKER, renderFakeCursor, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui"
import { drawSuggestion, EditorSuggestions } from "../src/editor"

test("ghost text keeps the cursor in place and fits the editor's cell width", () => {
  const line = `fix ${CURSOR_MARKER}${renderFakeCursor(" ")}    `
  const result = drawSuggestion(line, "界面测试", 9)
  expect(result).toContain(CURSOR_MARKER + renderFakeCursor("界"))
  expect(stripTerminalSequences(result)).toBe("fix 界面…")
  expect(visibleWidth(result)).toBe(9)
})

test("ghost text cannot send terminal escapes or overwrite an existing character", () => {
  const blank = CURSOR_MARKER + renderFakeCursor(" ")
  expect(stripTerminalSequences(drawSuggestion(blank, "\x1b[2J", 5))).toBe(" [2J ")
  const middle = CURSOR_MARKER + renderFakeCursor("x")
  expect(drawSuggestion(middle, "suffix", 8)).toBe(middle)
})

test("suggestions preserve a custom editor's rendering and submit handler", async () => {
  let text = ""
  let submitted = ""
  const base = {
    focused: true,
    getCursor: () => ({ line: 0, col: text.length }),
    getLines: () => [text],
    getText: () => text,
    setText: (value: string) => {
      text = value
    },
    insertTextAtCursor: (value: string) => {
      text += value
    },
    isShowingAutocomplete: () => false,
    invalidate: () => {},
    render: (_width: number) => ["custom border", `${text}${CURSOR_MARKER}${renderFakeCursor(" ")}`],
    handleInput: (data: string) => {
      if (data === "\r") submitted = text
    },
  }
  const suggestions = new EditorSuggestions(
    base,
    { requestRender() {} },
    () => true,
    async () => "run the tests",
  )
  suggestions.followUp()
  await Promise.resolve()
  expect(base.render(20).map(stripTerminalSequences)).toEqual(["custom border", "run the tests       "])
  base.handleInput("\t")
  expect(text).toBe("run the tests")
  expect(submitted).toBe("")
  base.handleInput("\r")
  expect(submitted).toBe("run the tests")
})
