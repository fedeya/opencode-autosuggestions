import { isCompletable, splitNextWord } from "@autosuggestions/core/text"
import {
  CURSOR_MARKER,
  type Editor,
  type EditorComponent,
  matchesKey,
  renderFakeCursor,
  replaceControlCharacters,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui"

type Suggest = (base: string, signal: AbortSignal) => Promise<string>
type PromptEditor = EditorComponent &
  Pick<Editor, "focused" | "getCursor" | "getLines" | "insertTextAtCursor" | "isShowingAutocomplete">

// Pi extensions may load separate class identities. Detect the editor capabilities, not its constructor.
export function supportsSuggestions(editor: EditorComponent): editor is PromptEditor {
  return (
    "focused" in editor &&
    typeof editor.focused === "boolean" &&
    "getCursor" in editor &&
    typeof editor.getCursor === "function" &&
    "getLines" in editor &&
    typeof editor.getLines === "function" &&
    typeof editor.insertTextAtCursor === "function" &&
    "isShowingAutocomplete" in editor &&
    typeof editor.isShowingAutocomplete === "function"
  )
}
const cursor = CURSOR_MARKER + renderFakeCursor(" ")
const graphemes = new Intl.Segmenter()

/** Replace the blank cursor cell and trailing editor padding without changing the editor text or cursor position. */
export function drawSuggestion(line: string, text: string, width: number) {
  const at = line.indexOf(cursor)
  if (at < 0) return line
  const before = line.slice(0, at)
  const room = width - visibleWidth(before)
  if (room < 1) return line
  const visible = truncateToWidth(replaceControlCharacters(text), room, "…", true)
  const first = graphemes.segment(visible).containing(0)?.segment
  if (!first) return line
  return `${before}\x1b[2m${CURSOR_MARKER}${renderFakeCursor(first)}${visible.slice(first.length)}\x1b[22m`
}

export class EditorSuggestions {
  private draft?: string
  private suggestion?: { base: string; rest: string }
  private timer?: ReturnType<typeof setTimeout>
  private request?: AbortController

  constructor(
    private editor: PromptEditor,
    private ui: Pick<TUI, "requestRender">,
    private canSuggest: () => boolean,
    private suggest: Suggest,
  ) {
    const render = editor.render.bind(editor)
    editor.render = (width) => this.render(render(width), width)
    const handleInput = editor.handleInput.bind(editor)
    editor.handleInput = (data) => {
      if (!this.handleInput(data)) handleInput(data)
    }
  }

  private active() {
    if (!this.canSuggest() || !this.editor.focused || this.editor.isShowingAutocomplete()) return false
    const { line, col } = this.editor.getCursor()
    const lines = this.editor.getLines()
    return line === lines.length - 1 && col === lines[line]?.length
  }

  private currentSuggestion() {
    return this.active() && this.suggestion?.base === this.editor.getText() ? this.suggestion : undefined
  }

  private clear() {
    clearTimeout(this.timer)
    this.request?.abort()
    this.suggestion = undefined
  }

  reset() {
    this.clear()
    this.draft = undefined
    this.ui.requestRender()
  }

  followUp() {
    if (!this.active() || this.editor.getText() !== "") return
    this.clear()
    this.draft = ""
    void this.generate("")
  }

  private async generate(base: string) {
    const request = new AbortController()
    this.request = request
    try {
      const rest = await this.suggest(base, request.signal)
      if (rest && !request.signal.aborted && this.active() && this.editor.getText() === base) {
        this.suggestion = { base, rest: replaceControlCharacters(rest) }
        this.ui.requestRender()
      }
    } catch {
      // A background suggestion failure must never interrupt editing.
    } finally {
      if (this.request === request) this.request = undefined
    }
  }

  private handleInput(data: string) {
    const suggestion = this.currentSuggestion()
    if (suggestion) {
      if (matchesKey(data, "escape")) {
        this.clear()
        return true
      }
      const wordOnly = matchesKey(data, "alt+right") || matchesKey(data, "alt+f") || matchesKey(data, "ctrl+right")
      if (wordOnly || matchesKey(data, "tab")) {
        const { word, rest } = wordOnly ? splitNextWord(suggestion.rest) : { word: suggestion.rest, rest: "" }
        this.editor.insertTextAtCursor(word)
        const base = this.editor.getText()
        this.draft = base
        this.suggestion = rest ? { base, rest } : undefined
        return true
      }
    }
    return false
  }

  private render(lines: string[], width: number) {
    const draft = this.active() ? this.editor.getText() : undefined
    // Observe programmatic edits and cursor moves as well as typing, without replacing Pi's onChange callback.
    if (draft !== this.draft) {
      this.clear()
      this.draft = draft
      if (draft !== undefined && isCompletable(draft.trimStart())) {
        this.timer = setTimeout(() => {
          if (this.active() && this.editor.getText() === draft) void this.generate(draft)
        }, 600)
      }
    }
    const suggestion = this.currentSuggestion()
    return suggestion ? lines.map((line) => drawSuggestion(line, suggestion.rest, width)) : lines
  }
}
