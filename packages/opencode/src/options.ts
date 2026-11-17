// Plugin options from `cli.json`, with defaults. Wrong types fall back to the default instead of failing.

export interface Options {
  readonly enabled: boolean
  /** `provider/model`, optionally `#variant`; undefined means Auto. */
  readonly model?: string
  readonly followUps: boolean
  readonly autocomplete: boolean
  readonly autocompleteDelay: number
  readonly acceptKey: string
  readonly acceptWordKey: string
  readonly dismissKey: string
  readonly maxMessages: number
  readonly maxChars: number
  readonly debug: boolean
}

export const DEFAULT_OPTIONS: Options = {
  enabled: true,
  followUps: true,
  autocomplete: true,
  autocompleteDelay: 600,
  acceptKey: "tab",
  acceptWordKey: "alt+right,alt+f,ctrl+right",
  dismissKey: "escape",
  maxMessages: 8,
  maxChars: 6000,
  debug: false,
}

export function resolveOptions(raw: Readonly<Record<string, unknown>> | undefined): Options {
  const value = raw ?? {}
  const boolean = (key: keyof Options) =>
    typeof value[key] === "boolean" ? (value[key] as boolean) : (DEFAULT_OPTIONS[key] as boolean)
  const number = (key: keyof Options) =>
    typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0
      ? (value[key] as number)
      : (DEFAULT_OPTIONS[key] as number)
  const string = (key: keyof Options) =>
    typeof value[key] === "string" && value[key] ? (value[key] as string) : (DEFAULT_OPTIONS[key] as string)
  return {
    enabled: boolean("enabled"),
    model: typeof value.model === "string" && value.model ? value.model : undefined,
    followUps: boolean("followUps"),
    autocomplete: boolean("autocomplete"),
    autocompleteDelay: number("autocompleteDelay"),
    acceptKey: string("acceptKey"),
    acceptWordKey: string("acceptWordKey"),
    dismissKey: string("dismissKey"),
    maxMessages: number("maxMessages"),
    maxChars: number("maxChars"),
    debug: boolean("debug"),
  }
}
