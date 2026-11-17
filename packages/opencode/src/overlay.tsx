/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode/plugin/tui"
import { createSignal, Show } from "solid-js"

export interface GhostText {
  readonly x: number
  readonly y: number
  readonly text: string
}

/**
 * Draws ghost text at a screen position, on a layer above the prompt. The textarea cannot draw text after the
 * cursor, and inserting real text would be sent on Enter, so suggestions are drawn here instead.
 */
export function createOverlay(context: Plugin.Context) {
  const [ghost, setGhost] = createSignal<GhostText>()
  const unregister = context.ui.slot({
    append: "app",
    render: () => (
      <Show when={ghost()}>
        {(current) => (
          <box position="absolute" left={current().x} top={current().y} height={1} zIndex={1000}>
            <text wrapMode="none" fg={context.theme.text.muted}>
              {current().text}
            </text>
          </box>
        )}
      </Show>
    ),
  })
  return {
    show(next: GhostText) {
      const current = ghost()
      if (current?.x === next.x && current.y === next.y && current.text === next.text) return
      setGhost(next)
    },
    hide() {
      if (ghost()) setGhost(undefined)
    },
    dispose: unregister,
  }
}
