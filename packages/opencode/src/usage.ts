// An estimate of what suggestions cost. OpenCode's generate API returns only text, without token counts, so tokens
// are estimated from text length and priced with the model's list price. Subscriptions have no price: only calls and
// tokens are counted for them.

import type { ModelOption, ModelRef } from "@autosuggestions/core/models"

export const CHARS_PER_TOKEN = 4
const KEEP_DAYS = 90

export type SuggestionKind = "followUp" | "completion"

export interface Counts {
  calls: number
  /** Calls cancelled before the reply arrived. The prompt was sent, so its tokens still count. */
  cancelled: number
  inputTokens: number
  outputTokens: number
  /** USD at list price; undefined for models without a price. */
  cost?: number
}

/** Counts per day ("2026-11-17"), then per model ("provider/model"), then per kind. */
export interface UsageLog {
  days: Record<string, Record<string, Partial<Record<SuggestionKind, Counts>>>>
}

export interface Call {
  readonly date: string
  readonly model: ModelRef
  readonly kind: SuggestionKind
  readonly prompt: string
  /** The reply, or undefined when the call was cancelled. */
  readonly reply?: string
  readonly price?: ModelOption["cost"]
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function localDate(time = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`
}

/** Adds a call to the log, and drops days older than three months. Mutates `log`, as a store update does. */
export function recordCall(log: UsageLog, call: Call) {
  const inputTokens = estimateTokens(call.prompt)
  const outputTokens = call.reply === undefined ? 0 : estimateTokens(call.reply)
  const tier = call.price?.[0]
  const model = `${call.model.providerID}/${call.model.id}`
  const day = log.days[call.date] ?? {}
  log.days[call.date] = day
  const byKind = day[model] ?? {}
  day[model] = byKind
  const counts = byKind[call.kind] ?? { calls: 0, cancelled: 0, inputTokens: 0, outputTokens: 0 }
  byKind[call.kind] = counts
  counts.calls += 1
  if (call.reply === undefined) counts.cancelled += 1
  counts.inputTokens += inputTokens
  counts.outputTokens += outputTokens
  if (tier) counts.cost = (counts.cost ?? 0) + (inputTokens * tier.input + outputTokens * tier.output) / 1_000_000
  const dates = Object.keys(log.days).sort()
  for (const date of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete log.days[date]
}

export interface Summary {
  readonly calls: number
  readonly cancelled: number
  readonly followUps: number
  readonly completions: number
  readonly inputTokens: number
  readonly outputTokens: number
  /** USD for the priced models only. */
  readonly cost: number
  /** Whether some calls went to models without a price. */
  readonly unpriced: boolean
}

const EMPTY: Summary = {
  calls: 0,
  cancelled: 0,
  followUps: 0,
  completions: 0,
  inputTokens: 0,
  outputTokens: 0,
  cost: 0,
  unpriced: false,
}

function add(summary: Summary, kind: SuggestionKind, counts: Counts): Summary {
  return {
    calls: summary.calls + counts.calls,
    cancelled: summary.cancelled + counts.cancelled,
    followUps: summary.followUps + (kind === "followUp" ? counts.calls : 0),
    completions: summary.completions + (kind === "completion" ? counts.calls : 0),
    inputTokens: summary.inputTokens + counts.inputTokens,
    outputTokens: summary.outputTokens + counts.outputTokens,
    cost: summary.cost + (counts.cost ?? 0),
    unpriced: summary.unpriced || counts.cost === undefined,
  }
}

/** Totals for the days from `from` on (all days when undefined), overall and per model. */
export function summarize(log: UsageLog, from?: string) {
  let total = EMPTY
  const models = new Map<string, Summary>()
  for (const [date, day] of Object.entries(log.days)) {
    if (from && date < from) continue
    for (const [model, byKind] of Object.entries(day)) {
      for (const [kind, counts] of Object.entries(byKind) as [SuggestionKind, Counts][]) {
        total = add(total, kind, counts)
        models.set(model, add(models.get(model) ?? EMPTY, kind, counts))
      }
    }
  }
  return { total, models }
}

export function formatTokens(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

export function formatCount(value: number, one: string, many = `${one}s`) {
  return `${value} ${value === 1 ? one : many}`
}

/** "$0.42", "<$0.01", "subscription", or "$0.42 + sub" when priced and unpriced models are mixed. */
export function formatCost(summary: Summary) {
  if (summary.cost === 0 && summary.unpriced) return "subscription"
  const cost = summary.cost > 0 && summary.cost < 0.01 ? "<$0.01" : `$${summary.cost.toFixed(2)}`
  return summary.unpriced ? `${cost} + sub` : cost
}

export interface UsageReport {
  readonly periods: readonly { readonly label: string; readonly summary: Summary }[]
  /** The last 7 days per model, most calls first. */
  readonly models: readonly { readonly model: string; readonly summary: Summary }[]
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** The numbers for the usage dialog: today, the last 7 days, all days kept, and the last 7 days per model. */
export function usageReport(log: UsageLog, today = localDate()): UsageReport {
  const week = new Date(`${today}T00:00:00`)
  week.setDate(week.getDate() - 6)
  const weekStart = localDate(week)
  const first = Object.keys(log.days).sort()[0] ?? today
  const [, month, day] = first.split("-").map(Number)
  return {
    periods: [
      { label: "Today", summary: summarize(log, today).total },
      { label: "Last 7 days", summary: summarize(log, weekStart).total },
      { label: `Since ${MONTHS[(month ?? 1) - 1]} ${day}`, summary: summarize(log).total },
    ],
    models: [...summarize(log, weekStart).models]
      .map(([model, summary]) => ({ model, summary }))
      .sort((a, b) => b.summary.calls - a.summary.calls),
  }
}
