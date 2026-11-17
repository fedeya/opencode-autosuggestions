import { AUTO, pickModels } from "@autosuggestions/core/models"
import { completionPrompt, followUpPrompt } from "@autosuggestions/core/prompts"
import { clip, clipEnd, parseCompletion, parseFollowUp } from "@autosuggestions/core/text"
import type { Api, Model } from "@earendil-works/pi-ai"
import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent"
import { EditorSuggestions, supportsSuggestions } from "./editor"

type Messages = ReturnType<ExtensionContext["sessionManager"]["buildSessionProjection"]>["messages"]
type EditorFactory = NonNullable<Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]>

function transcript(messages: Messages) {
  const lines = messages.flatMap((message) => {
    if (message.role === "user") {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
      return text.trim() ? [`USER: ${clip(text.trim(), 1200)}`] : []
    }
    if (message.role !== "assistant") return []
    const tools = new Set(message.content.flatMap((part) => (part.type === "toolCall" ? [part.name] : [])))
    const text = message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n")
      .trim()
    return [
      ...(tools.size ? [`ASSISTANT (used tools: ${[...tools].join(", ")})`] : []),
      ...(text ? [`ASSISTANT: ${clipEnd(text, 2000)}`] : []),
    ]
  })
  return clipEnd(lines.slice(-8).join("\n\n"), 6000)
}

async function suggest(ctx: ExtensionContext, base: string, signal: AbortSignal) {
  const current = ctx.model
  if (!current) return ""
  const { messages } = ctx.sessionManager.buildSessionProjection()
  if (!base && messages.findLast((message) => message.role === "assistant")?.stopReason !== "stop") return ""
  const conversation = transcript(messages)
  const prompt = base ? completionPrompt(conversation, base) : followUpPrompt(conversation)
  const available = new Map<string, Model<Api>>()
  const scoped = ctx.scopedModels.map(({ model }) => model)
  for (const model of [...(scoped.length ? scoped : ctx.modelRegistry.getAvailable()), current]) {
    if (model.provider === current.provider) available.set(model.id, model)
  }
  const models = [...available.values()].map(({ provider, id, name, cost }) => ({
    providerID: provider,
    id,
    name,
    cost: [cost],
  }))
  for (const { id } of pickModels(models, AUTO, { providerID: current.provider, id: current.id })) {
    const model = available.get(id)
    if (signal.aborted) return ""
    if (!model) continue
    const response = await ctx.modelRegistry
      .streamSimple(
        model,
        {
          messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        },
        { signal, maxTokens: 128 },
      )
      .result()
    if (signal.aborted || response.stopReason === "aborted") return ""
    if (response.stopReason === "error") continue
    if (response.stopReason !== "stop") return ""
    const text = response.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")
    return base ? parseCompletion(base, text) : parseFollowUp(text)
  }
  return ""
}

export default function autosuggestions(pi: ExtensionAPI) {
  let editor: EditorSuggestions | undefined
  let factory: EditorFactory | undefined
  let previousFactory: EditorFactory | undefined
  let enabled = true
  let waiting = false

  pi.on("session_start", (_event, ctx) => {
    editor?.reset()
    editor = undefined
    waiting = false
    if (!ctx.hasUI) return
    const existing = ctx.ui.getEditorComponent()
    if (existing !== factory) previousFactory = existing
    const previous = previousFactory
    factory = (tui, theme, keys) => {
      const base = previous?.(tui, theme, keys) ?? new CustomEditor(tui, theme, keys, { embedWorkingStatus: true })
      if (!supportsSuggestions(base)) {
        ctx.ui.notify("Autosuggestions skipped: the custom editor is incompatible", "warning")
        return base
      }
      const instance: EditorSuggestions = new EditorSuggestions(
        base,
        tui,
        () => editor === instance && enabled && !waiting && ctx.isIdle() && !ctx.hasPendingMessages(),
        (base, signal) => suggest(ctx, base, signal),
      )
      editor = instance
      return base
    }
    ctx.ui.setEditorComponent(factory)
  })
  pi.on("session_shutdown", () => {
    editor?.reset()
    editor = undefined
  })
  pi.on("session_tree", () => {
    editor?.reset()
  })
  pi.on("model_select", () => {
    editor?.reset()
  })
  pi.on("input", () => {
    editor?.reset()
  })
  pi.on("agent_start", () => {
    editor?.reset()
  })
  pi.on("ui_prompt_start", () => {
    waiting = true
    editor?.reset()
  })
  pi.on("ui_prompt_end", () => {
    waiting = false
    editor?.reset()
  })
  pi.on("agent_settled", (event) => {
    if (!event.aborted) editor?.followUp()
  })
  pi.registerCommand("autosuggestions", {
    description: "Toggle prompt autosuggestions",
    handler: async (_args, ctx) => {
      enabled = !enabled
      editor?.reset()
      ctx.ui.notify(`Autosuggestions ${enabled ? "on" : "off"}`, "info")
    },
  })
}
