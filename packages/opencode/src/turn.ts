import type { SessionMessageInfo } from "@opencode/client"

// Finish reasons that mean the answer did not end the way the agent meant it to.
const BROKEN_FINISH = new Set(["error", "length", "content-filter"])

/** Whether the latest answer ended normally, so a follow-up makes sense. Not after an error or a cut-off answer. */
export function endedCleanly(messages: readonly SessionMessageInfo[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type === "user") return false
    if (message?.type !== "assistant") continue
    return !message.error && !BROKEN_FINISH.has(message.finish ?? "")
  }
  return false
}
