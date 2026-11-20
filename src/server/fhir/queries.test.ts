// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Browsing the registry (EL10) on real PostgreSQL with the real client on a stub registry that
// serves the synthetic package: the facilitator only, and every failure as a refusal code.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { projectWithMembers } from "../test-project-members.ts";
import { createFhirClient, type FhirClient, type FhirFailure } from "./client.ts";
import {
  fhirRefused,
  listFhirStructures,
  listFhirVersions,
  readFhirStructure,
  searchFhirPackages,
} from "./queries.ts";
import { fixturePackage } from "./test-package.ts";

const PACKAGE = "example.fhir.bp";
const PROFILE = "http://example.org/fhir/StructureDefinition/example-BloodPressure";

let db: Kysely<DB>;
let server: Server;
let fhir: FhirClient;
let calls: number;

beforeEach(async () => {
  db = await createTestDb();
  calls = 0;
  server = createServer((request, response) => {
    calls += 1;
    const path = new URL(request.url ?? "/", "http://stub").pathname;
    if (path === "/catalog") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify([{ Name: PACKAGE, Description: "BP", FhirVersion: "R4" }]));
    } else if (path === `/${PACKAGE}`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ name: PACKAGE, versions: { "1.0.0": { fhirVersion: "R4" } } }));
    } else if (path === `/${PACKAGE}/1.0.0`) {
      response.writeHead(200, { "Content-Type": "application/tar+gzip" });
      response.end(fixturePackage());
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  fhir = createFhirClient({ baseUrl: `http://127.0.0.1:${port}`, log: () => undefined });
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

describe("browsing the FHIR package registry", () => {
  it("lets the facilitator search, list versions and StructureDefinitions, and read one", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    expect(await searchFhirPackages(db, fhir, facilitator, { projectId, text: "example" })).toEqual(
      { ok: true, value: [{ name: PACKAGE, description: "BP", fhirVersion: "R4" }] },
    );
    expect(
      await listFhirVersions(db, fhir, facilitator, { projectId, packageName: PACKAGE }),
    ).toEqual({ ok: true, value: [{ version: "1.0.0", fhirVersion: "R4" }] });
    const structures = await listFhirStructures(db, fhir, facilitator, {
      projectId,
      packageName: PACKAGE,
      version: "1.0.0",
    });
    expect(structures.ok && structures.value.map((sd) => sd.kind)).toEqual(["logical", "resource"]);
    const profile = await readFhirStructure(db, fhir, facilitator, {
      projectId,
      packageName: PACKAGE,
      version: "1.0.0",
      url: PROFILE,
    });
    expect(profile.ok && profile.value.elements).toHaveLength(14);
  });

  it("browses in any phase: reading the registry changes nothing", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "handoff");
    expect(
      (await searchFhirPackages(db, fhir, facilitator, { projectId, text: "example" })).ok,
    ).toBe(true);
  });

  it("refuses a participant and an outsider before calling the registry", async () => {
    const { projectId, participant, outsider } = await projectWithMembers(db, "discover");
    const input = { projectId, text: "example" };
    expect(await searchFhirPackages(db, fhir, participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await searchFhirPackages(db, fhir, outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(calls).toBe(0);
  });

  it("refuses an unknown package, version and StructureDefinition", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    expect(
      await listFhirVersions(db, fhir, facilitator, { projectId, packageName: "example.none" }),
    ).toEqual({ ok: false, error: "fhir_package_not_found" });
    expect(
      await listFhirStructures(db, fhir, facilitator, {
        projectId,
        packageName: PACKAGE,
        version: "2.0.0",
      }),
    ).toEqual({ ok: false, error: "fhir_package_not_found" });
    expect(
      await readFhirStructure(db, fhir, facilitator, {
        projectId,
        packageName: PACKAGE,
        version: "1.0.0",
        url: "http://example.org/fhir/StructureDefinition/none",
      }),
    ).toEqual({ ok: false, error: "fhir_structure_not_found" });
  });
});

describe("fhirRefused", () => {
  it.each<[FhirFailure, unknown]>([
    [{ kind: "unreachable" }, { ok: false, error: "fhir_unreachable" }],
    [{ kind: "timeout" }, { ok: false, error: "fhir_timeout" }],
    [
      { kind: "refused", status: 500 },
      { ok: false, error: "fhir_refused", status: 500 },
    ],
    [{ kind: "not_found" }, { ok: false, error: "fhir_package_not_found" }],
    [{ kind: "no_structure" }, { ok: false, error: "fhir_structure_not_found" }],
    [{ kind: "too_large" }, { ok: false, error: "fhir_too_large" }],
    [{ kind: "unusable" }, { ok: false, error: "fhir_unusable" }],
    [{ kind: "not_r4" }, { ok: false, error: "fhir_not_r4" }],
    [{ kind: "no_snapshot" }, { ok: false, error: "fhir_no_snapshot" }],
  ])("maps %o", (failure, expected) => {
    expect(fhirRefused(failure)).toEqual(expected);
  });
});
