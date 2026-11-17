import type { ModelRef } from "@autosuggestions/core/models"
import { clip, clipEnd } from "@autosuggestions/core/text"
import type { SessionMessageInfo } from "@opencode/client"

const MAX_USER_MESSAGE_CHARS = 1200
const MAX_ASSISTANT_MESSAGE_CHARS = 2000
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm

export interface TranscriptLimits {
  /** Lines kept from the end; an assistant turn takes one line for its tools and one for its text. */
  readonly maxMessages: number
  readonly maxChars: number
  /** The session's directory, to show file paths relative to it. */
  readonly directory?: string
}

type AssistantPart = Extract<SessionMessageInfo, { type: "assistant" }>["content"][number]

/** The files a tool call worked on, from the inputs of OpenCode's file tools. */
function toolFiles(input: Record<string, unknown>) {
  if (typeof input.path === "string") return [input.path]
  if (typeof input.patchText === "string")
    return [...input.patchText.matchAll(PATCH_FILE)].map((match) => match[1] ?? "")
  return []
}

function relative(path: string, directory: string | undefined) {
  if (directory && path.startsWith(`${directory}/`)) return path.slice(directory.length + 1)
  return path.startsWith("/") ? path.split("/").slice(-2).join("/") : path
}

/** "edit src/app.ts" for file tools, the bare name for the rest. */
function describeTool(part: Extract<AssistantPart, { type: "tool" }>, directory: string | undefined) {
  // Streaming calls carry their input as raw text until it is complete.
  const input = "input" in part.state && typeof part.state.input === "object" ? part.state.input : {}
  const files = toolFiles(input).filter(Boolean)
  return files.length ? files.map((file) => `${part.name} ${relative(file, directory)}`) : [part.name]
}

/**
 * The recent conversation as plain text for the suggestion model. Tools appear by name and the files they touched,
 * never with their output.
 */
export function formatTranscript(messages: readonly SessionMessageInfo[], limits: TranscriptLimits) {
  const lines: string[] = []
  for (const message of messages) {
    if (message.type === "user") {
      const text = message.text.trim()
      if (text) lines.push(`USER: ${clip(text, MAX_USER_MESSAGE_CHARS)}`)
      continue
    }
    if (message.type !== "assistant") continue
    const tools = new Set(
      message.content.flatMap((part) => (part.type === "tool" ? describeTool(part, limits.directory) : [])),
    )
    const text = message.content
      .flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text.trim()] : []))
      .join("\n")
    if (tools.size) lines.push(`ASSISTANT (used tools: ${[...tools].join(", ")})`)
    if (text) lines.push(`ASSISTANT: ${clipEnd(text, MAX_ASSISTANT_MESSAGE_CHARS)}`)
  }
  return clipEnd(lines.slice(-limits.maxMessages).join("\n\n"), limits.maxChars)
}

/** The model of the latest assistant message: what the session actually ran. */
export function lastAssistantModel(messages: readonly SessionMessageInfo[]): ModelRef | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type === "assistant") return { providerID: message.model.providerID, id: message.model.id }
  }
}
