// Which model generates suggestions, and in which order to try models and reasoning levels.

export const AUTO = "auto"

export interface ModelRef {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

/** The fields of an OpenCode model that matter here; `ModelInfo` from `@opencode/client` satisfies it. */
export interface ModelOption {
  readonly providerID: string
  readonly id: string
  readonly name?: string
  readonly variants?: readonly { readonly id: string }[]
  readonly cost?: readonly { readonly input: number; readonly output: number }[]
}

// Names that usually mean a small, fast model. Used when a provider reports no prices (subscriptions), so cost
// cannot rank its models.
const SMALL_MODEL = /haiku|mini|nano|flash|lite|small|lightning|tiny/i
// Speed tiers are often not included in a subscription, and cost more otherwise.
const SPEED_TIER = /-(fast|ultrafast|flex|priority)$/i
// Reasoning off first. Not every account allows it, so attempts fall back to the model default and then "low",
// which some models handle worse than their default.
const NO_REASONING = ["none", "minimal"]
const LOW_REASONING = ["low"]
// Errors about the request itself (a level or speed tier the account does not include). Network and rate-limit
// errors are not on this list: they may pass next time.
const SETTINGS_ERROR = /(?:not|n't) available|unavailable|invalid|unsupported/i

/** Parses "provider/model" or "provider/model#variant". */
export function parseModelRef(value: string): ModelRef {
  const [path = "", variant] = value.split("#")
  const slash = path.indexOf("/")
  const ref = slash > 0 ? { providerID: path.slice(0, slash), id: path.slice(slash + 1) } : { providerID: "", id: path }
  return variant ? { ...ref, variant } : ref
}

export function sameModel(a: ModelRef, b: ModelRef) {
  return a.providerID === b.providerID && a.id === b.id
}

export function refKey(ref: ModelRef) {
  return `${ref.providerID}/${ref.id}#${ref.variant ?? ""}`
}

const price = (model: ModelOption) => {
  const tier = model.cost?.[0]
  return tier ? tier.input + tier.output : 0
}

/**
 * Models to try for a choice, best first. A pinned choice is used as is. Auto stays on the provider of the
 * session's model, so it only uses an account already in use: its cheapest priced model, else one whose name says
 * it is small, and finally the session's model itself.
 */
export function pickModels(available: readonly ModelOption[], choice: string, session?: ModelRef): ModelOption[] {
  if (choice !== AUTO) {
    const ref = parseModelRef(choice)
    return [available.find((model) => sameModel(model, ref)) ?? { providerID: ref.providerID, id: ref.id }]
  }
  const own = session ? available.filter((model) => model.providerID === session.providerID) : [...available]
  const pool = own.filter((model) => !SPEED_TIER.test(model.id))
  const priced = pool.filter((model) => price(model) > 0).sort((a, b) => price(a) - price(b))
  const small = pool.filter((model) => SMALL_MODEL.test(`${model.id} ${model.name ?? ""}`))
  const current = session && own.find((model) => sameModel(model, session))
  const picks = [...priced.slice(0, 1), ...small.slice(0, 1), ...(current ? [current] : [])]
  return picks.filter((model, index) => picks.findIndex((other) => sameModel(other, model)) === index)
}

/** Model and reasoning-level combinations to call, in order, until one succeeds. */
export function attempts(candidates: readonly ModelOption[], choice: string): ModelRef[] {
  const ref = (model: ModelOption, variant?: string): ModelRef =>
    variant ? { providerID: model.providerID, id: model.id, variant } : { providerID: model.providerID, id: model.id }
  if (choice !== AUTO) {
    const model = candidates[0]
    if (!model) return []
    const { variant } = parseModelRef(choice)
    return variant ? [ref(model, variant), ref(model)] : [ref(model)]
  }
  return candidates.flatMap((model) => {
    const listed = new Set((model.variants ?? []).map((variant) => variant.id))
    return [
      ...NO_REASONING.filter((variant) => listed.has(variant)).map((variant) => ref(model, variant)),
      ref(model),
      ...LOW_REASONING.filter((variant) => listed.has(variant)).map((variant) => ref(model, variant)),
    ]
  })
}

/** Whether a failed call means the account will never accept that model and level, so it is not retried. */
export function isSettingsError(error: unknown) {
  const message = typeof error === "object" && error !== null && "message" in error ? error.message : error
  return SETTINGS_ERROR.test(String(message ?? ""))
}

export function modelLabel(ref: ModelRef, available: readonly ModelOption[]) {
  const name = available.find((model) => sameModel(model, ref))?.name ?? `${ref.providerID}/${ref.id}`
  return ref.variant ? `${name} (${ref.variant})` : name
}

export function costLabel(model: ModelOption) {
  const tier = model.cost?.[0]
  if (!tier) return "subscription"
  if (tier.input === 0 && tier.output === 0) return "free"
  return `$${tier.input} / $${tier.output} per 1M`
}
