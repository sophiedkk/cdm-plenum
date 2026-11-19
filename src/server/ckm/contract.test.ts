// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Contract test against the live CKM (ADR 0006): the calls and answer shapes the client relies
// on. It runs only with CKM_CONTRACT=1 (`pnpm test:ckm`), since it needs the network.
import { describe, expect, it } from "vitest";
import { createCkmClient } from "./client.ts";

const enabled = process.env["CKM_CONTRACT"] === "1";
const baseUrl = process.env["CKM_BASE_URL"]?.trim();

describe.skipIf(!enabled)("CKM REST API contract", () => {
  const ckm = createCkmClient({
    timeoutMs: 30_000,
    ...(baseUrl ? { baseUrl } : {}),
    log: (line) => console.warn(line),
  });

  it("finds blood pressure v2 by search text, with cid and revision", async () => {
    const result = await ckm.searchArchetypes("blood pressure", 10);
    if (result.kind !== "ok") throw new Error(`search: ${JSON.stringify(result)}`);
    const row = result.value.find(
      (archetype) => archetype.archetypeId === "openEHR-EHR-OBSERVATION.blood_pressure.v2",
    );
    expect(row?.cid).toBe("1013.1.3574");
    expect(row?.revision).toMatch(/^2\.\d+\.\d+/);
  });

  it("reads the elements of blood pressure v2 from its XML", async () => {
    const result = await ckm.archetypeElements("1013.1.3574");
    if (result.kind !== "ok") throw new Error(`archetype: ${JSON.stringify(result)}`);
    expect(result.value.archetypeId).toBe("openEHR-EHR-OBSERVATION.blood_pressure.v2");
    expect(result.value.originalLanguage).toBe("en");
    expect(result.value.elements).toContainEqual(
      expect.objectContaining({
        path: "/data[at0001]/events[at0006]/data[at0003]/items[at0004]",
        atCode: "at0004",
        name: "Systolic",
        rmTypes: ["DV_QUANTITY"],
      }),
    );
  });

  it("writes an interval type as DV_INTERVAL<DV_QUANTITY> (dosage v2)", async () => {
    const result = await ckm.archetypeElements("1013.1.5948");
    if (result.kind !== "ok") throw new Error(`archetype: ${JSON.stringify(result)}`);
    const types = result.value.elements.flatMap((element) => element.rmTypes);
    expect(types).toContain("DV_INTERVAL<DV_QUANTITY>");
  });

  it("answers 404 for an unknown cid", async () => {
    expect(await ckm.archetypeElements("9999.9.9999")).toEqual({ kind: "refused", status: 404 });
  });
});
