import { appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Suggestions fail quietly so they never get in the way. With `"debug": true` the failures are written here
// instead of discarded: the TUI owns the terminal, so nothing can be printed.
export const LOG_FILE = join(tmpdir(), "opencode-autosuggestions.log")

export type Log = (message: string, error?: unknown) => void

export function createLog(enabled: boolean): Log {
  if (!enabled) return () => {}
  return (message, error) => {
    const detail = error === undefined ? "" : ` ${error instanceof Error ? error.message : String(error)}`
    try {
      appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}${detail}\n`)
    } catch {
      // Logging must never break the plugin.
    }
  }
}
