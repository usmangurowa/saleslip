// Bundles the server and the boot-time migration script into dist/ for the
// Docker image (`pnpm -F @turbo/server bundle`). Workspace packages and npm
// dependencies are inlined, so the runtime image needs no node_modules.
// Local dev is unchanged: `pnpm dev` / `start` still run src/ through tsx.
import { build } from "esbuild";

await build({
  entryPoints: { index: "src/index.ts", migrate: "src/migrate.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  outExtension: { ".js": ".mjs" },
  sourcemap: true,
  jsx: "automatic",
  legalComments: "none",
  logLevel: "info",
  // CommonJS dependencies call require() for Node builtins; ESM output needs a
  // real require in scope for those calls.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
