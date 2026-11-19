// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CKM client against a local stub server: every result kind, the body cap, redirects, the
// cache and what the client logs (ADR 0006, R-06).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CkmClientOptions, createCkmClient } from "./client.ts";
import { ckmFixture } from "./test-fixtures.ts";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server;
let baseUrl: string;
let routes: Map<string, Handler>;
let requests: { path: string; accept: string | undefined }[];
let lines: string[];

const BP_CID = "1013.1.3574";
const BP_ID = "openEHR-EHR-OBSERVATION.blood_pressure.v2";
const BP_BUILD = "ac39a1a0-a269-4816-9391-7f475515f04e";

function row(overrides: Record<string, unknown> = {}) {
  return {
    cid: BP_CID,
    resourceType: "ARCHETYPE",
    resourceMainDisplayName: "Blood pressure",
    resourceMainId: BP_ID,
    status: "PUBLISHED",
    revision: "2.0.17",
    buildUid: BP_BUILD,
    projectName: "Vital signs",
    ...overrides,
  };
}

function json(body: unknown, status = 200): Handler {
  return (_request, response) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
}

function xml(body: string): Handler {
  return (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/xml" });
    response.end(body);
  };
}

beforeEach(async () => {
  routes = new Map();
  requests = [];
  lines = [];
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stub");
    requests.push({ path: `${url.pathname}${url.search}`, accept: request.headers.accept });
    const handler = routes.get(url.pathname);
    if (handler) handler(request, response);
    else {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ckm/rest`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

function client(options: CkmClientOptions = {}) {
  return createCkmClient({ baseUrl, log: (line) => lines.push(line), ...options });
}

describe("searchArchetypes", () => {
  it("sends the search the requirements name and maps the rows", async () => {
    routes.set("/ckm/rest/v1/archetypes", json([row()]));
    const result = await client().searchArchetypes("  blood   pressure ", 10);
    expect(result).toEqual({
      kind: "ok",
      value: [
        {
          cid: BP_CID,
          archetypeId: BP_ID,
          name: "Blood pressure",
          status: "PUBLISHED",
          revision: "2.0.17",
        },
      ],
    });
    expect(requests).toHaveLength(1);
    const sent = new URL(requests[0]?.path ?? "", "http://stub");
    expect(sent.searchParams.get("search-text")).toBe("blood pressure");
    expect(sent.searchParams.get("restrict-search-to-main-data")).toBe("true");
    expect(sent.searchParams.get("sort-key")).toBe("RELEVANCE");
    expect(sent.searchParams.get("size")).toBe("10");
    expect(requests[0]?.accept).toBe("application/json");
    expect(lines).toEqual([]);
  });

  it("caches a search for one day by text and size", async () => {
    routes.set("/ckm/rest/v1/archetypes", json([row()]));
    let now = 0;
    const ckm = client({ now: () => now });
    await ckm.searchArchetypes("Blood pressure", 10);
    await ckm.searchArchetypes("blood  PRESSURE", 10);
    expect(requests).toHaveLength(1);
    await ckm.searchArchetypes("blood pressure", 20);
    expect(requests).toHaveLength(2);
    now = 24 * 60 * 60 * 1000;
    await ckm.searchArchetypes("blood pressure", 10);
    expect(requests).toHaveLength(3);
  });

  it("drops the oldest cache entry beyond the limit", async () => {
    routes.set("/ckm/rest/v1/archetypes", json([row()]));
    const ckm = client({ cacheEntries: 1 });
    await ckm.searchArchetypes("a", 10);
    await ckm.searchArchetypes("b", 10);
    await ckm.searchArchetypes("a", 10);
    expect(requests).toHaveLength(3);
  });

  it("returns refused with the status and does not cache it", async () => {
    routes.set("/ckm/rest/v1/archetypes", json({ error: "busy" }, 503));
    const ckm = client();
    expect(await ckm.searchArchetypes("blood pressure", 10)).toEqual({
      kind: "refused",
      status: 503,
    });
    await ckm.searchArchetypes("blood pressure", 10);
    expect(requests).toHaveLength(2);
  });

  it("follows no redirect", async () => {
    let followed = false;
    routes.set("/ckm/rest/v1/archetypes", (_request, response) => {
      response.writeHead(302, { Location: "/elsewhere" });
      response.end();
    });
    routes.set("/elsewhere", (_request, response) => {
      followed = true;
      json([row()])(_request, response);
    });
    expect(await client().searchArchetypes("x", 10)).toEqual({ kind: "refused", status: 302 });
    expect(followed).toBe(false);
  });

  it("returns unusable for a body that is not JSON", async () => {
    routes.set("/ckm/rest/v1/archetypes", xml("<html>maintenance</html>"));
    expect(await client().searchArchetypes("x", 10)).toEqual({ kind: "unusable" });
  });

  it("returns unusable for JSON of another shape, such as a paged envelope", async () => {
    routes.set("/ckm/rest/v1/archetypes", json({ totalElements: 1, content: [row()] }));
    expect(await client().searchArchetypes("x", 10)).toEqual({ kind: "unusable" });
  });

  it("returns unusable when a row lacks a field or has a malformed cid", async () => {
    const { revision: _dropped, ...withoutRevision } = row();
    routes.set("/ckm/rest/v1/archetypes", json([row(), withoutRevision]));
    expect(await client().searchArchetypes("x", 10)).toEqual({ kind: "unusable" });
    routes.set("/ckm/rest/v1/archetypes", json([row({ cid: "../admin" })]));
    expect(await client().searchArchetypes("y", 10)).toEqual({ kind: "unusable" });
  });

  it("returns unusable for a declared body over the cap", async () => {
    routes.set("/ckm/rest/v1/archetypes", (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json", "Content-Length": "2048" });
      response.end("x".repeat(2048));
    });
    expect(await client({ maxBytes: 1024 }).searchArchetypes("x", 10)).toEqual({
      kind: "unusable",
    });
  });

  it("returns unusable for a streamed body that grows over the cap", async () => {
    routes.set("/ckm/rest/v1/archetypes", (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      for (let i = 0; i < 8; i += 1) response.write("x".repeat(512));
      response.end();
    });
    expect(await client({ maxBytes: 1024 }).searchArchetypes("x", 10)).toEqual({
      kind: "unusable",
    });
  });

  it("returns timeout when CKM sends no answer in time", async () => {
    routes.set("/ckm/rest/v1/archetypes", () => undefined);
    expect(await client({ timeoutMs: 100 }).searchArchetypes("x", 10)).toEqual({
      kind: "timeout",
    });
  });

  it("returns timeout when the body stops halfway", async () => {
    routes.set("/ckm/rest/v1/archetypes", (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write("[");
    });
    expect(await client({ timeoutMs: 100 }).searchArchetypes("x", 10)).toEqual({
      kind: "timeout",
    });
  });

  it("returns unreachable when nothing listens", async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    expect(await client().searchArchetypes("x", 10)).toEqual({ kind: "unreachable" });
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  it("logs the call and the outcome, never the search text, the URL or the body", async () => {
    const secret = "patient-name-in-search";
    routes.set("/ckm/rest/v1/archetypes", (_request, response) => {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(`stack trace with ${secret}`);
    });
    await client().searchArchetypes(secret, 10);
    routes.set("/ckm/rest/v1/archetypes", xml(`not json ${secret}`));
    await client().searchArchetypes(secret, 10);
    expect(lines).toEqual(["ckm search: refused 500", "ckm search: unusable (not JSON)"]);
    for (const line of lines) {
      expect(line).not.toContain(secret);
      expect(line).not.toContain("127.0.0.1");
    }
  });
});

describe("archetypeElements", () => {
  function serveBloodPressure(info = row(), body = ckmFixture("blood_pressure.v2.xml")) {
    routes.set(`/ckm/rest/v1/archetypes/${BP_CID}`, json(info));
    routes.set(`/ckm/rest/v1/archetypes/${BP_CID}/xml`, xml(body));
  }

  it("reads the current revision, then the XML, and returns the elements", async () => {
    serveBloodPressure();
    const result = await client().archetypeElements(BP_CID);
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(result.value).toMatchObject({
      cid: BP_CID,
      archetypeId: BP_ID,
      name: "Blood pressure",
      revision: "2.0.17",
      originalLanguage: "en",
    });
    expect(result.value.elements).toHaveLength(17);
    expect(requests.map((request) => [request.path, request.accept])).toEqual([
      [`/ckm/rest/v1/archetypes/${BP_CID}`, "application/json"],
      [`/ckm/rest/v1/archetypes/${BP_CID}/xml`, "application/xml"],
    ]);
  });

  it("caches the elements by cid and revision", async () => {
    serveBloodPressure();
    const ckm = client();
    await ckm.archetypeElements(BP_CID);
    await ckm.archetypeElements(BP_CID);
    expect(requests.filter((request) => request.path.endsWith("/xml"))).toHaveLength(1);
    serveBloodPressure(row({ revision: "2.0.18", buildUid: undefined }));
    const next = await ckm.archetypeElements(BP_CID);
    expect(next.kind === "ok" && next.value.revision).toBe("2.0.18");
    expect(requests.filter((request) => request.path.endsWith("/xml"))).toHaveLength(2);
  });

  it("refuses a malformed cid without calling CKM", async () => {
    expect(await client().archetypeElements("1013/../../admin")).toEqual({ kind: "unusable" });
    expect(requests).toEqual([]);
  });

  it("returns refused for an unknown cid", async () => {
    expect(await client().archetypeElements("9999.9.9999")).toEqual({
      kind: "refused",
      status: 404,
    });
  });

  it("returns refused when the XML call fails", async () => {
    routes.set(`/ckm/rest/v1/archetypes/${BP_CID}`, json(row()));
    expect(await client().archetypeElements(BP_CID)).toEqual({ kind: "refused", status: 404 });
  });

  it("returns unusable when the row names another cid", async () => {
    serveBloodPressure(row({ cid: "1013.1.1" }));
    expect(await client().archetypeElements(BP_CID)).toEqual({ kind: "unusable" });
  });

  it("returns unusable for XML that does not parse or is not an archetype", async () => {
    serveBloodPressure(row(), "<archetype><definition>");
    expect(await client().archetypeElements(BP_CID)).toEqual({ kind: "unusable" });
    expect(lines).toContain("ckm archetype xml: unusable (malformed)");
  });

  it("returns unusable when the XML is another archetype or another build", async () => {
    serveBloodPressure(row({ resourceMainId: "openEHR-EHR-OBSERVATION.pulse.v2" }));
    expect(await client().archetypeElements(BP_CID)).toEqual({ kind: "unusable" });
    serveBloodPressure(row({ buildUid: "another-build" }));
    expect(await client().archetypeElements(BP_CID)).toEqual({ kind: "unusable" });
  });
});
