import { describe, expect, test } from "bun:test"
import {
  AUTO,
  attempts,
  costLabel,
  isSettingsError,
  type ModelOption,
  modelLabel,
  parseModelRef,
  pickModels,
} from "../src/models"

const priced = (providerID: string, id: string, input: number, output: number, variants: string[] = []) =>
  ({ providerID, id, name: id, cost: [{ input, output }], variants: variants.map((id) => ({ id })) }) as ModelOption
const subscription = (providerID: string, id: string, variants: string[] = []) =>
  ({ providerID, id, name: id, cost: [], variants: variants.map((id) => ({ id })) }) as ModelOption
const ids = (models: readonly ModelOption[]) => models.map((model) => `${model.providerID}/${model.id}`)

const haiku = priced("anthropic", "claude-haiku-5-5", 0.1, 0.5, ["none", "low"])
const anthropic = [
  priced("anthropic", "claude-opus-5-5", 4, 20),
  haiku,
  priced("anthropic", "claude-haiku-4-5", 1, 5),
  priced("anthropic", "claude-opus-5-5-fast", 8, 40),
]
const sol = subscription("openai", "gpt-6-sol")
const luna = subscription("openai", "gpt-6-luna", ["none", "low", "high"])
const openai = [sol, luna]

describe("parseModelRef", () => {
  test("reads provider, model, and an optional variant", () => {
    expect(parseModelRef("openai/gpt-6-luna")).toEqual({ providerID: "openai", id: "gpt-6-luna" })
    expect(parseModelRef("openai/gpt-6-luna#low")).toEqual({ providerID: "openai", id: "gpt-6-luna", variant: "low" })
    expect(parseModelRef("openrouter/anthropic/claude")).toEqual({ providerID: "openrouter", id: "anthropic/claude" })
  })
})

describe("pickModels", () => {
  test("Auto picks the cheapest priced model of the session's provider, then the session's model", () => {
    const session = { providerID: "anthropic", id: "claude-opus-5-5" }
    expect(ids(pickModels([...anthropic, ...openai], AUTO, session))).toEqual([
      "anthropic/claude-haiku-5-5",
      "anthropic/claude-opus-5-5",
    ])
  })

  test("Auto never leaves the session's provider", () => {
    const session = { providerID: "openai", id: "gpt-6-luna" }
    expect(ids(pickModels([...anthropic, ...openai], AUTO, session))).toEqual(["openai/gpt-6-luna"])
  })

  test("Auto uses a small-sounding model when the provider has no prices", () => {
    const models = [subscription("acme", "big-model"), subscription("acme", "acme-mini")]
    expect(ids(pickModels(models, AUTO, { providerID: "acme", id: "big-model" }))).toEqual([
      "acme/acme-mini",
      "acme/big-model",
    ])
  })

  test("Auto skips speed tiers", () => {
    const models = [priced("acme", "small-fast", 0.01, 0.01), priced("acme", "small", 0.1, 0.1)]
    expect(ids(pickModels(models, AUTO, { providerID: "acme", id: "small" }))).toEqual(["acme/small"])
  })

  test("keeps models with the same id from different providers apart", () => {
    const session = { providerID: "b", id: "shared-mini" }
    const models = [priced("a", "shared-mini", 0.1, 0.1), subscription("b", "shared-mini")]
    expect(ids(pickModels(models, AUTO, session))).toEqual(["b/shared-mini"])
  })

  test("a pinned model is used even when it is not listed", () => {
    expect(ids(pickModels(anthropic, "anthropic/claude-sonnet-5-5", undefined))).toEqual([
      "anthropic/claude-sonnet-5-5",
    ])
  })
})

describe("attempts", () => {
  test("Auto tries reasoning off, then the default, then low", () => {
    expect(attempts([luna], AUTO)).toEqual([
      { providerID: "openai", id: "gpt-6-luna", variant: "none" },
      { providerID: "openai", id: "gpt-6-luna" },
      { providerID: "openai", id: "gpt-6-luna", variant: "low" },
    ])
  })

  test("a pinned variant falls back to the model default", () => {
    expect(attempts([luna], "openai/gpt-6-luna#low")).toEqual([
      { providerID: "openai", id: "gpt-6-luna", variant: "low" },
      { providerID: "openai", id: "gpt-6-luna" },
    ])
  })
})

describe("isSettingsError", () => {
  test("recognizes errors that will not pass on retry", () => {
    expect(isSettingsError(new Error("This reasoning level isn't available for the selected model"))).toBe(true)
    expect(isSettingsError({ message: "Variant unavailable for openai/gpt-6-luna: minimal" })).toBe(true)
    expect(isSettingsError(new Error("Fast mode isn't available for the selected model in your workspace"))).toBe(true)
    expect(isSettingsError(new Error("fetch failed"))).toBe(false)
    expect(isSettingsError(undefined)).toBe(false)
  })
})

describe("labels", () => {
  test("describe cost and name a model", () => {
    expect(costLabel(haiku)).toBe("$0.1 / $0.5 per 1M")
    expect(costLabel(sol)).toBe("subscription")
    expect(costLabel(priced("opencode", "free", 0, 0))).toBe("free")
    expect(modelLabel({ providerID: "openai", id: "gpt-6-luna", variant: "low" }, openai)).toBe("gpt-6-luna (low)")
    expect(modelLabel({ providerID: "x", id: "y" }, openai)).toBe("x/y")
  })
})
