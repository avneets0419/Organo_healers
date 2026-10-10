import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Bundle the workspace package's TypeScript; load its npm dependencies from node_modules.
  noExternal: ["@organo/shared"],
  external: ["qrcode", "decimal.js", "zod", "react", "react-dom", "geist"],
  // Any CommonJS code that still ends up in the bundle needs a real `require`.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
