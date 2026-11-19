// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Paraglide compiler options, shared by the Vite plugin and the CLI (`pnpm i18n`).
import { defineConfig } from "@inlang/paraglide-js";

export default defineConfig({
  outdir: "./src/i18n",
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
  // Physical message files, so tsc, Vitest and plain Node resolve them without the Vite plugin.
  outputStructure: "message-modules",
  emitTsDeclarations: true,
  emitReadme: false,
  emitPrettierIgnore: false,
});
