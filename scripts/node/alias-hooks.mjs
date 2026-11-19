// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Lets plain Node run the app's server code outside Vite (for example `pnpm db:seed-demo`):
// `@/x` resolves to `src/x`, and an import without an extension tries `.ts`, `.tsx`, `.js` and
// `index.ts`, as Vite's resolver does. Loaded with `node --import ./scripts/node/alias-hooks.mjs`.
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const EXTENSIONS = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.js"];

function findFile(base) {
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const file = findFile(SRC + specifier.slice(2));
      if (file) return nextResolve(pathToFileURL(file).href, context);
    }
    // Only the app's own sources: packages resolve their imports themselves, and a CommonJS
    // package's relative require must stay a path, not become a file URL.
    const parent = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : "";
    if (specifier.startsWith(".") && parent.startsWith(SRC)) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      if (!existsSync(base) || !statSync(base).isFile()) {
        const file = findFile(base);
        if (file) return nextResolve(pathToFileURL(file).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
