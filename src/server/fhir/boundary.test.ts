// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// ADR 0011: src/server/fhir/ is the only module that calls the FHIR package registry, so no
// other module may name the registry host. The scan covers the code under src/ and tests/.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REGISTRY_HOST = /packages\.fhir\.org/i;
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The code files below `dirs` of `root`, outside `allowed`, whose text names the registry. */
function filesNamingRegistry(root: string, dirs: string[], allowed: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = relative(root, path).split(sep).join("/");
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && `${name}/` !== allowed) visit(path);
      } else if (CODE.test(entry.name) && REGISTRY_HOST.test(readFileSync(path, "utf8"))) {
        found.push(name);
      }
    }
  };
  for (const dir of dirs) visit(join(root, dir));
  return found.sort();
}

describe("one FHIR package client (ADR 0011)", () => {
  it("names the registry host only in src/server/fhir/", () => {
    expect(filesNamingRegistry(ROOT, ["src", "tests"], "src/server/fhir/")).toEqual([]);
  });

  it("finds a module elsewhere that names the registry host", () => {
    const root = mkdtempSync(join(tmpdir(), "fhir-boundary-"));
    try {
      mkdirSync(join(root, "src/server/fhir"), { recursive: true });
      mkdirSync(join(root, "src/routes"), { recursive: true });
      writeFileSync(
        join(root, "src/server/fhir/client.ts"),
        'const a = "https://packages.fhir.org";',
      );
      writeFileSync(
        join(root, "src/routes/page.tsx"),
        'fetch("https://Packages.FHIR.org/catalog");',
      );
      writeFileSync(join(root, "src/routes/notes.md"), "https://packages.fhir.org");
      expect(filesNamingRegistry(root, ["src"], "src/server/fhir/")).toEqual([
        "src/routes/page.tsx",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
