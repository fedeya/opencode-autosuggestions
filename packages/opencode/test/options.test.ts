import { describe, expect, test } from "bun:test"
import { DEFAULT_OPTIONS, resolveOptions } from "../src/options"

describe("resolveOptions", () => {
  test("uses the defaults when nothing is set", () => {
    expect(resolveOptions(undefined)).toEqual({ ...DEFAULT_OPTIONS, model: undefined })
  })

  test("reads valid values", () => {
    const options = resolveOptions({ model: "openai/gpt-6-luna#low", followUps: false, autocompleteDelay: 800 })
    expect(options.model).toBe("openai/gpt-6-luna#low")
    expect(options.followUps).toBe(false)
    expect(options.autocompleteDelay).toBe(800)
  })

  test("falls back to the default for values of the wrong type", () => {
    const options = resolveOptions({ autocomplete: "no", autocompleteDelay: -1, acceptKey: "", model: 3 })
    expect(options.autocomplete).toBe(true)
    expect(options.autocompleteDelay).toBe(600)
    expect(options.acceptKey).toBe("tab")
    expect(options.model).toBeUndefined()
  })
})
