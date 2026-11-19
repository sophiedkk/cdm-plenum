// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// `node tests/e2e/ckm-stub.ts`: a stand-in for the CKM REST API on E2E_CKM_PORT, so the e2e
// suite never calls the live CKM. It answers the three calls of docs/requirements.md, "External
// sources", from the archetype fixtures in tests/fixtures/ckm/. A search text containing
// "unavailable" gets HTTP 503, so a spec can show how the board handles a CKM failure.
// Relative imports only: plain Node runs it.
import { readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { ckmStubPort } from "./run-env.ts";

interface StubArchetype {
  cid: string;
  resourceMainId: string;
  resourceMainDisplayName: string;
  status: string;
  revision: string;
  buildUid: string;
  file: string;
}

// The cid, revision and build uid are those in each fixture's header and description.
const ARCHETYPES: StubArchetype[] = [
  {
    cid: "1013.1.3574",
    resourceMainId: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
    resourceMainDisplayName: "Blood pressure",
    status: "PUBLISHED",
    revision: "2.0.17",
    buildUid: "ac39a1a0-a269-4816-9391-7f475515f04e",
    file: "blood_pressure.v2.xml",
  },
  {
    cid: "1013.1.5948",
    resourceMainId: "openEHR-EHR-CLUSTER.dosage.v2",
    resourceMainDisplayName: "Dosage",
    status: "PUBLISHED",
    revision: "2.0.3",
    buildUid: "673dfd30-fb11-4c55-92c3-5023241a841e",
    file: "dosage.v2.xml",
  },
  {
    cid: "1013.1.2881",
    resourceMainId: "openEHR-EHR-CLUSTER.laboratory_test_analyte.v1",
    resourceMainDisplayName: "Laboratory analyte result",
    status: "PUBLISHED",
    revision: "1.2.3",
    buildUid: "b0f08214-c8af-4437-9fdf-7ee6b24f83a1",
    file: "laboratory_test_analyte.v1.xml",
  },
];

function row({ file: _file, ...archetype }: StubArchetype) {
  return { ...archetype, resourceType: "ARCHETYPE" };
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, { "Content-Type": type });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://stub");
  if (url.pathname === "/health") return send(response, 200, "text/plain", "ok");
  if (url.pathname === "/ckm/rest/v1/archetypes") {
    const text = (url.searchParams.get("search-text") ?? "").toLowerCase();
    if (text.includes("unavailable")) return send(response, 503, "text/plain", "unavailable");
    const words = text.split(" ").filter((word) => word !== "");
    const found = ARCHETYPES.filter((archetype) =>
      words.every((word) => archetype.resourceMainDisplayName.toLowerCase().includes(word)),
    );
    return send(response, 200, "application/json", JSON.stringify(found.map(row)));
  }
  const match = /^\/ckm\/rest\/v1\/archetypes\/([0-9.]+)(\/xml)?$/.exec(url.pathname);
  const archetype = ARCHETYPES.find((candidate) => candidate.cid === match?.[1]);
  if (!match || !archetype) return send(response, 404, "text/plain", "not found");
  if (match[2]) {
    const xml = readFileSync(new URL(`../fixtures/ckm/${archetype.file}`, import.meta.url), "utf8");
    return send(response, 200, "application/xml", xml);
  }
  return send(response, 200, "application/json", JSON.stringify(row(archetype)));
});

server.listen(ckmStubPort(), "127.0.0.1");
