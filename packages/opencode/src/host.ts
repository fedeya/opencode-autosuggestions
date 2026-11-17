import type { CliRenderer, EditBufferRenderable, StyledText } from "@opentui/core"

// OpenCode's plugin API cannot read the prompt or draw inside it, so the plugin works with the TUI's own prompt
// textarea through the renderer. These are OpenCode internals, not public API: everything that depends on them is
// in this file, so an OpenCode update that changes them needs fixing in one place.

export type PromptEditor = EditBufferRenderable & { placeholder: StyledText | string | null }

/**
 * The prompt's textarea while it has focus and is not in shell mode. Dialogs focus their own editors; the prompt
 * marks itself with the trait `role: "prompt"`, and shell mode with `status: "SHELL"`.
 */
export function focusedPrompt(renderer: CliRenderer): PromptEditor | undefined {
  const editor = renderer.currentFocusedEditor
  if (!editor || editor.isDestroyed || !("placeholder" in editor)) return
  const traits = editor.traits as { role?: string; status?: string }
  if (traits.role !== "prompt" || traits.status === "SHELL") return
  return editor as PromptEditor
}

/** Whether nothing follows the cursor. Offsets count display cells, so this compares text instead of lengths. */
export function isCursorAtEnd(editor: PromptEditor) {
  const start = editor.cursorOffset
  return editor.getTextRange(start, start + editor.plainText.length * 2 + 1) === ""
}

export function setPromptText(editor: PromptEditor, text: string) {
  editor.setText(text)
  editor.gotoBufferEnd()
}

/** The screen cell under the cursor, and how many cells remain on that line of the prompt. */
export function cursorCell(editor: PromptEditor) {
  const cursor = editor.visualCursor
  const x = editor.x + cursor.visualCol
  return { x, y: editor.y + cursor.visualRow, room: editor.x + editor.width - x }
}

/**
 * Hides the prompt's placeholder while a follow-up is drawn over the empty prompt, and puts it back afterwards.
 * OpenCode resets the placeholder on its own (resizes, session switches), so `hide` runs on every tick.
 */
export function createPlaceholderGuard() {
  let held: { editor: PromptEditor; original: PromptEditor["placeholder"] } | undefined
  const restore = () => {
    if (!held) return
    if (!held.editor.isDestroyed && held.editor.placeholder === "") held.editor.placeholder = held.original
    held = undefined
  }
  const hide = (editor: PromptEditor) => {
    if (held && held.editor !== editor) restore()
    if (held && editor.placeholder === "") return
    held = { editor, original: editor.placeholder }
    editor.placeholder = ""
  }
  return { hide, restore }
}
