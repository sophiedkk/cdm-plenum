// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// ADR 0006: src/server/ckm/ is the only module that calls CKM, so no other module may name the
// CKM host. The scan covers the code under src/ and tests/.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CKM_HOST = /ckm\.openehr\.org/i;
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The code files below `dirs` of `root`, outside `allowed`, whose text names the CKM host. */
function filesNamingCkm(root: string, dirs: string[], allowed: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = relative(root, path).split(sep).join("/");
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && `${name}/` !== allowed) visit(path);
      } else if (CODE.test(entry.name) && CKM_HOST.test(readFileSync(path, "utf8"))) {
        found.push(name);
      }
    }
  };
  for (const dir of dirs) visit(join(root, dir));
  return found.sort();
}

describe("one CKM client (ADR 0006)", () => {
  it("names the CKM host only in src/server/ckm/", () => {
    expect(filesNamingCkm(ROOT, ["src", "tests"], "src/server/ckm/")).toEqual([]);
  });

  it("finds a module elsewhere that names the CKM host", () => {
    const root = mkdtempSync(join(tmpdir(), "ckm-boundary-"));
    try {
      mkdirSync(join(root, "src/server/ckm"), { recursive: true });
      mkdirSync(join(root, "src/routes"), { recursive: true });
      writeFileSync(join(root, "src/server/ckm/client.ts"), 'const a = "https://ckm.openehr.org";');
      writeFileSync(
        join(root, "src/routes/page.tsx"),
        'fetch("https://CKM.openEHR.org/ckm/rest");',
      );
      writeFileSync(join(root, "src/routes/notes.md"), "https://ckm.openehr.org");
      expect(filesNamingCkm(root, ["src"], "src/server/ckm/")).toEqual(["src/routes/page.tsx"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
