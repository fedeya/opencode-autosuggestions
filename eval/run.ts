// Runs every eval case through the current prompts and saves the results under eval/results/<label>.
//
//   bun eval/run.ts <label> [--samples 2] [--models anthropic/claude-haiku-5-5#none,openai/gpt-6-luna]
//
// Calls go through the local OpenCode service, so they use your configured providers.

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type ModelRef, parseModelRef } from "@autosuggestions/core/models"
import { completionPrompt, followUpPrompt } from "@autosuggestions/core/prompts"
import { parseCompletion, parseFollowUp } from "@autosuggestions/core/text"
import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { formatTranscript } from "../packages/opencode/src/transcript"
import { type CompletionCase, completionCases, type FollowUpCase, followUpCases } from "./cases"
import { detectLanguage, type Result } from "./shared"

// What Auto ends up using on Anthropic and on an OpenAI subscription.
const DEFAULT_MODELS = ["anthropic/claude-haiku-5-5#none", "openai/gpt-6-luna"]
const CONCURRENCY = 4
const COMPLETION_CONTEXT_MESSAGES = 6
const LIMITS = { maxMessages: 8, maxChars: 6000 }

const args = process.argv.slice(2)
const label = args.find((arg) => !arg.startsWith("--"))
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
if (!label) {
  console.error("usage: bun eval/run.ts <label> [--samples n] [--models a,b]")
  process.exit(1)
}
const samples = Number(flag("samples") ?? 1)
const models = (flag("models")?.split(",") ?? DEFAULT_MODELS).map(parseModelRef)

const endpoint = await Service.discover()
if (!endpoint) {
  console.error("No OpenCode service running. Start OpenCode first.")
  process.exit(1)
}
const auth = endpoint.auth && `Basic ${btoa(`${endpoint.auth.username}:${endpoint.auth.password}`)}`
const client = OpenCode.make({ baseUrl: endpoint.url, headers: auth ? { authorization: auth } : {} })

const modelName = (model: ModelRef) => `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ""}`

async function generate(prompt: string, model: ModelRef) {
  const start = performance.now()
  try {
    const { text } = await client.experimental.generate.text({ prompt, model })
    return { raw: text, ms: Math.round(performance.now() - start) }
  } catch (error) {
    return { raw: "", ms: Math.round(performance.now() - start), error: String(error) }
  }
}

function followUpJob(testCase: FollowUpCase, model: ModelRef, sample: number) {
  return async (): Promise<Result> => {
    const { raw, ms, error } = await generate(followUpPrompt(formatTranscript(testCase.messages, LIMITS)), model)
    const suggestion = parseFollowUp(raw)
    return {
      kind: "followUp",
      case: testCase.id,
      model: modelName(model),
      sample,
      raw,
      suggestion,
      ms,
      error,
      language: suggestion ? detectLanguage(suggestion) : undefined,
      expectedLanguage: testCase.language,
      avoided: Boolean(suggestion && testCase.avoid?.test(suggestion)),
    }
  }
}

function completionJob(testCase: CompletionCase, model: ModelRef, sample: number) {
  return async (): Promise<Result> => {
    const conversation = formatTranscript(testCase.messages, { ...LIMITS, maxMessages: COMPLETION_CONTEXT_MESSAGES })
    const { raw, ms, error } = await generate(completionPrompt(conversation, testCase.unfinished), model)
    const rest = parseCompletion(testCase.unfinished, raw)
    const full = testCase.unfinished + rest
    return {
      kind: "completion",
      case: testCase.id,
      model: modelName(model),
      sample,
      raw,
      suggestion: rest,
      ms,
      error,
      language: rest ? detectLanguage(full) : undefined,
      expectedLanguage: testCase.language,
      avoided: Boolean(rest && testCase.avoid?.test(full)),
    }
  }
}

const jobs = models.flatMap((model) =>
  Array.from({ length: samples }, (_, sample) => [
    ...followUpCases.map((testCase) => followUpJob(testCase, model, sample)),
    ...completionCases.map((testCase) => completionJob(testCase, model, sample)),
  ]).flat(),
)

const results: Result[] = []
let done = 0
async function worker() {
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    results.push(await job())
    process.stderr.write(`\r${++done} done`)
  }
}
const total = jobs.length
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
process.stderr.write(`\r${total} calls done\n`)

const directory = join(import.meta.dir, "results")
mkdirSync(directory, { recursive: true })
const file = join(directory, `${label}.json`)
writeFileSync(file, `${JSON.stringify({ label, date: new Date().toISOString(), results }, null, 2)}\n`)
console.log(`Saved ${file}`)
console.log(`Compare with: bun eval/compare.ts <other-label> ${label}`)
