// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Contract test against the live FHIR package registry (ADR 0011): the calls and answer shapes
// the client relies on. It runs only with FHIR_CONTRACT=1 (`pnpm test:fhir`), since it needs
// the network.
import { describe, expect, it } from "vitest";
import { createFhirClient } from "./client.ts";

const enabled = process.env["FHIR_CONTRACT"] === "1";
const baseUrl = process.env["FHIR_REGISTRY_URL"]?.trim();

const ZIB_PACKAGE = "nictiz.fhir.nl.r4.zib2020";
const ZIB_BLOOD_PRESSURE = "http://nictiz.nl/fhir/StructureDefinition/zib-BloodPressure";

describe.skipIf(!enabled)("FHIR package registry contract", () => {
  const fhir = createFhirClient({
    timeoutMs: 120_000,
    ...(baseUrl ? { baseUrl } : {}),
    log: (line) => console.warn(line),
  });

  it("finds the Nictiz packages in the R4 catalog", async () => {
    const result = await fhir.searchPackages("nictiz");
    if (result.kind !== "ok") throw new Error(`search: ${JSON.stringify(result)}`);
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.every((row) => row.name.startsWith("nictiz"))).toBe(true);
  });

  it("finds the prerelease zib2020 package by name", async () => {
    const result = await fhir.searchPackages("zib2020");
    if (result.kind !== "ok") throw new Error(`search: ${JSON.stringify(result)}`);
    expect(result.value.map((row) => row.name)).toContain(ZIB_PACKAGE);
  });

  it("opens R4 core 4.0.1 and lists the bp profile", { timeout: 180_000 }, async () => {
    const result = await fhir.structureDefinitions("hl7.fhir.r4.core", "4.0.1");
    if (result.kind !== "ok") throw new Error(`package: ${JSON.stringify(result)}`);
    expect(result.value.map((sd) => sd.url)).toContain(
      "http://hl7.org/fhir/StructureDefinition/bp",
    );
  });

  it("lists the versions of the zib2020 package", async () => {
    const result = await fhir.packageVersions(ZIB_PACKAGE);
    if (result.kind !== "ok") throw new Error(`versions: ${JSON.stringify(result)}`);
    expect(result.value.map((row) => row.version)).toContain("0.12.1-beta.1");
  });

  it("reads zib BloodPressure with its systolic code and NL-CM mappings", {
    timeout: 180_000,
  }, async () => {
    const list = await fhir.structureDefinitions(ZIB_PACKAGE, "0.12.1-beta.1");
    if (list.kind !== "ok") throw new Error(`package: ${JSON.stringify(list)}`);
    expect(list.value.map((sd) => sd.url)).toContain(ZIB_BLOOD_PRESSURE);
    const result = await fhir.structureDefinition(ZIB_PACKAGE, "0.12.1-beta.1", ZIB_BLOOD_PRESSURE);
    if (result.kind !== "ok") throw new Error(`structure: ${JSON.stringify(result)}`);
    expect(result.value.zib).toEqual({ name: "BloodPressure", version: "3.2.1(2020EN)" });
    expect(result.value.elements).toContainEqual(
      expect.objectContaining({
        id: "Observation.component:SystolicBP",
        codes: [{ system: "http://loinc.org", code: "8480-6", display: null }],
      }),
    );
    expect(result.value.elements).toContainEqual(
      expect.objectContaining({
        id: "Observation.component:SystolicBP.value[x]",
        nlCmId: "NL-CM:12.4.2",
        types: ["Quantity"],
      }),
    );
  });

  it("answers not_found for an unknown package", async () => {
    expect(await fhir.packageVersions("example.no.such.package")).toEqual({ kind: "not_found" });
  });
});
