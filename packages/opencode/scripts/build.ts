import { runtimeModuleIdForSpecifier } from "@opentui/core/runtime-plugin"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

// Compile before publishing: OpenCode's Solid source transform skips node_modules.
// Shared runtime imports keep the plugin's signals and renderables in the host.
const shared = new Set(["@opencode/plugin/tui", "@opentui/core", "@opentui/solid", "solid-js", "solid-js/store"])

const result = await Bun.build({
  entrypoints: ["./src/tui.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  external: [...shared, "opentui:*"],
  plugins: [
    createSolidTransformPlugin({
      moduleName: runtimeModuleIdForSpecifier("@opentui/solid"),
      resolvePath(specifier) {
        if (shared.has(specifier)) return runtimeModuleIdForSpecifier(specifier)
        return null
      },
    }),
  ],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
