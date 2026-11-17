/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode/plugin/tui"
import { For } from "solid-js"
import { CHARS_PER_TOKEN, formatCost, formatCount, formatTokens, type UsageReport } from "./usage"

const LABEL_WIDTH = 14
const NUMBER_WIDTH = 9
const BAR_WIDTH = 18

const pad = (text: string, width: number) => text.padStart(width)

/** The usage report as a dialog: a table per period, then a bar per model. */
export function UsageDialog(props: { context: Plugin.Context; report: UsageReport }) {
  const theme = props.context.theme
  const colors = theme.categorical.length ? theme.categorical : [theme.hue.accent]
  const color = (index: number) => colors[index % colors.length]?.[500] ?? theme.text.base
  const mostCalls = Math.max(1, ...props.report.models.map((entry) => entry.summary.calls))

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text.base}>
          <b>Suggestion usage</b>
        </text>
        <text fg={theme.text.faint}>esc</text>
      </box>

      <box flexDirection="column">
        <text fg={theme.text.faint}>
          {`${"".padEnd(LABEL_WIDTH)}${pad("calls", NUMBER_WIDTH)}${pad("tokens", NUMBER_WIDTH)}${pad("cost", NUMBER_WIDTH + 6)}`}
        </text>
        <For each={props.report.periods}>
          {(period) => (
            <text fg={theme.text.base}>
              <span style={{ fg: theme.text.muted }}>{period.label.padEnd(LABEL_WIDTH)}</span>
              {pad(String(period.summary.calls), NUMBER_WIDTH)}
              {pad(formatTokens(period.summary.inputTokens + period.summary.outputTokens), NUMBER_WIDTH)}
              {pad(period.summary.calls ? formatCost(period.summary) : "—", NUMBER_WIDTH + 6)}
            </text>
          )}
        </For>
      </box>

      <box flexDirection="column">
        <text fg={theme.text.faint}>Last 7 days by model</text>
        {props.report.models.length ? null : <text fg={theme.text.muted}>No suggestions yet.</text>}
        <For each={props.report.models}>
          {(entry, index) => {
            const filled = Math.max(1, Math.round((entry.summary.calls / mostCalls) * BAR_WIDTH))
            const [provider, ...rest] = entry.model.split("/")
            return (
              <box flexDirection="column" paddingTop={1}>
                <text fg={theme.text.base}>
                  <span style={{ fg: color(index()) }}>{"● "}</span>
                  {rest.join("/")}
                  <span style={{ fg: theme.text.muted }}>{` ${provider}`}</span>
                </text>
                <text fg={theme.text.muted}>
                  {"  "}
                  <span style={{ fg: color(index()) }}>{"█".repeat(filled)}</span>
                  <span style={{ fg: theme.text.faint }}>{"░".repeat(BAR_WIDTH - filled)}</span>
                  {`  ${formatCount(entry.summary.calls, "call")} · ${formatCost(entry.summary)}`}
                </text>
                <text fg={theme.text.faint}>
                  {`  ${formatCount(entry.summary.completions, "completion")} · ${formatCount(entry.summary.followUps, "follow-up")} · ${entry.summary.cancelled} cancelled`}
                </text>
              </box>
            )
          }}
        </For>
      </box>

      <text fg={theme.text.faint}>{`Estimated: about ${CHARS_PER_TOKEN} characters per token, at list prices.`}</text>
    </box>
  )
}

export function showUsageDialog(context: Plugin.Context, report: UsageReport) {
  context.ui.dialog.set({ size: "medium" })
  context.ui.dialog.show(() => <UsageDialog context={context} report={report} />)
}
