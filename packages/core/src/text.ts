// Turning model output into suggestions, and fitting them on screen.

const MAX_FOLLOW_UP_CHARS = 200
const MAX_COMPLETION_CHARS = 160
const MIN_COMPLETION_INPUT = 3
// Quotes wrapping the whole reply. Backticks are left alone: they belong to code in the message.
const WRAPPING_QUOTES = /^["'“”]+(.*?)["'“”]+$/s

export function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function clipEnd(text: string, max: number) {
  return text.length > max ? `…${text.slice(-max)}` : text
}

/** Whether a prompt can be autocompleted. Slash commands, shell commands, and `@` mentions belong to OpenCode. */
export function isCompletable(text: string) {
  return (
    text.trim().length >= MIN_COMPLETION_INPUT &&
    !text.startsWith("/") &&
    !text.startsWith("!") &&
    !/(^|\s)@\S*$/.test(text)
  )
}

/** The follow-up from the model's reply, or "" when it has none. */
export function parseFollowUp(raw: string) {
  const line = raw
    .trim()
    .split("\n")
    .map((value) => value.trim())
    .find(Boolean)
  if (!line) return ""
  const text = line
    .replace(/^(next user message|user)\s*:\s*/i, "")
    .replace(WRAPPING_QUOTES, "$1")
    .trim()
  if (!text || /^none\.?$/i.test(text)) return ""
  return text.length > MAX_FOLLOW_UP_CHARS ? "" : text
}

/**
 * What to append to `text`, given the model's reply. The model returns the whole message, which is more reliable
 * than asking for only the missing part: it keeps word boundaries intact.
 */
export function parseCompletion(text: string, raw: string) {
  const line = raw.split("\n").find((value) => value.trim()) ?? ""
  const full = line.replace(/^complete message\s*:\s*/i, "").replace(WRAPPING_QUOTES, "$1")
  const trimmed = full.trim()
  if (!trimmed || /^none\.?$/i.test(trimmed)) return ""
  if (/(^|\s)NONE\.?$/.test(trimmed) && !/(^|\s)NONE\.?$/.test(text.trim())) return ""
  // In a multi-line prompt the model may echo only the last line.
  const lastLine = text.split("\n").at(-1) ?? ""
  const base = full.startsWith(text) ? text : lastLine.trim() && full.startsWith(lastLine) ? lastLine : undefined
  if (base === undefined) return ""
  const rest = full.slice(base.length).trimEnd()
  return rest.trim() && rest.length <= MAX_COMPLETION_CHARS ? rest : ""
}

/**
 * Fits a suggestion and its hint into `room` cells, cutting the suggestion (never the hint) with "…".
 * Returns "" when there is no useful room left.
 */
export function fitSuggestion(body: string, hint: string, room: number) {
  const minimum = hint.length + (hint ? 4 : 2)
  if (room < minimum) return ""
  if (body.length + hint.length <= room) return `${body}${hint}`
  return `${body.slice(0, room - hint.length - 1)}…${hint}`
}

/**
 * Splits off the next word of a suggestion, with the spaces before it, for accepting one word at a time.
 * Returns the whole text as `word` when only one word is left.
 */
export function splitNextWord(text: string) {
  const word = /^\s*\S+/.exec(text)?.[0] ?? text
  const rest = text.slice(word.length)
  return rest.trim() ? { word, rest } : { word: text, rest: "" }
}
