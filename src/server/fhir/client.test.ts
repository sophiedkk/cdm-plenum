// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The FHIR registry client against a local stub server: every result kind, the size caps,
// redirects, the cache and what the client logs (ADR 0011).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareVersionsDescending, createFhirClient, type FhirClientOptions } from "./client.ts";
import { fixturePackage, fixturePackageFiles, tarGz } from "./test-package.ts";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server;
let baseUrl: string;
let routes: Map<string, Handler>;
let requests: string[];
let lines: string[];

const PACKAGE = "example.fhir.bp";
const PROFILE = "http://example.org/fhir/StructureDefinition/example-BloodPressure";
const MODEL = "http://example.org/fhir/StructureDefinition/BloodPressureModel";

function json(body: unknown, status = 200): Handler {
  return (_request, response) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
}

function bytes(body: Buffer, headers: Record<string, string> = {}): Handler {
  return (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/tar+gzip", ...headers });
    response.end(body);
  };
}

beforeEach(async () => {
  routes = new Map();
  requests = [];
  lines = [];
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stub");
    requests.push(`${url.pathname}${url.search}`);
    const handler = routes.get(url.pathname);
    if (handler) handler(request, response);
    else {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/registry`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

function client(options: FhirClientOptions = {}) {
  return createFhirClient({ baseUrl, log: (line) => lines.push(line), ...options });
}

describe("searchPackages", () => {
  it("asks the catalog for R4 packages by name and maps the rows", async () => {
    routes.set(
      "/registry/catalog",
      json([
        { Name: "example.fhir.bp", Description: "Blood pressure", FhirVersion: "R4" },
        { Name: "example.fhir.other", Description: null, FhirVersion: null },
      ]),
    );
    expect(await client().searchPackages(" example ")).toEqual({
      kind: "ok",
      value: [
        { name: "example.fhir.bp", description: "Blood pressure", fhirVersion: "R4" },
        { name: "example.fhir.other", description: "", fhirVersion: "" },
      ],
    });
    expect(requests).toEqual(["/registry/catalog?name=example&fhirversion=R4&prerelease=true"]);
  });

  it("calls a row without a name unusable", async () => {
    routes.set("/registry/catalog", json([{ Description: "no name" }]));
    expect(await client().searchPackages("x")).toEqual({ kind: "unusable" });
    expect(lines).toEqual(["fhir search: unusable (unexpected shape)"]);
  });

  it("calls an answer that is not JSON unusable", async () => {
    routes.set("/registry/catalog", (_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<html></html>");
    });
    expect(await client().searchPackages("x")).toEqual({ kind: "unusable" });
    expect(lines).toEqual(["fhir search: unusable (not JSON)"]);
  });

  it("refuses an answer over the JSON cap", async () => {
    routes.set("/registry/catalog", json([{ Name: "a".repeat(200) }]));
    expect(await client({ maxJsonBytes: 100 }).searchPackages("x")).toEqual({
      kind: "too_large",
    });
  });

  it("follows no redirect and reports the status", async () => {
    routes.set("/registry/catalog", (_request, response) => {
      response.writeHead(302, { Location: "https://elsewhere.example.test/" });
      response.end();
    });
    expect(await client().searchPackages("x")).toEqual({ kind: "refused", status: 302 });
    expect(lines).toEqual(["fhir search: refused 302"]);
  });

  it("reports a server that is not there as unreachable", async () => {
    const closed = createFhirClient({
      baseUrl: "http://127.0.0.1:9/registry",
      log: (line) => lines.push(line),
    });
    expect(await closed.searchPackages("x")).toEqual({ kind: "unreachable" });
  });

  it("times out a slow answer", async () => {
    routes.set("/registry/catalog", () => undefined);
    expect(await client({ timeoutMs: 50 }).searchPackages("x")).toEqual({ kind: "timeout" });
    expect(lines).toEqual(["fhir search: timeout"]);
  });
});

describe("packageVersions", () => {
  it("lists the versions, the newest first", async () => {
    routes.set(
      `/registry/${PACKAGE}`,
      json({
        name: PACKAGE,
        versions: {
          "0.9.0": { version: "0.9.0", fhirVersion: "R4" },
          "1.0.0": { version: "1.0.0", fhirVersion: "R4" },
          "1.0.0-beta.2": { version: "1.0.0-beta.2" },
          "0.10.0": { version: "0.10.0", fhirVersion: "R4" },
        },
      }),
    );
    const result = await client().packageVersions(PACKAGE);
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(result.value).toEqual([
      { version: "1.0.0", fhirVersion: "R4" },
      { version: "1.0.0-beta.2", fhirVersion: null },
      { version: "0.10.0", fhirVersion: "R4" },
      { version: "0.9.0", fhirVersion: "R4" },
    ]);
  });

  it("answers not_found for an unknown package", async () => {
    expect(await client().packageVersions("no.such.package")).toEqual({ kind: "not_found" });
  });

  it("refuses a name that is no package name without calling the registry", async () => {
    expect(await client().packageVersions("../catalog")).toEqual({ kind: "unusable" });
    expect(requests).toEqual([]);
  });
});

describe("compareVersionsDescending", () => {
  it("orders by semantic versioning precedence", () => {
    const versions = ["1.0.0-alpha", "1.0.0", "1.0.0-alpha.1", "1.0.0-beta", "1.0.0-beta.11"];
    versions.push("1.0.0-beta.2", "1.0.0-rc.1", "0.12.1-beta.1", "2.0", "1.0.0-alpha.beta");
    expect(versions.sort(compareVersionsDescending)).toEqual([
      "2.0",
      "1.0.0",
      "1.0.0-rc.1",
      "1.0.0-beta.11",
      "1.0.0-beta.2",
      "1.0.0-beta",
      "1.0.0-alpha.beta",
      "1.0.0-alpha.1",
      "1.0.0-alpha",
      "0.12.1-beta.1",
    ]);
  });
});

describe("structureDefinitions and structureDefinition", () => {
  beforeEach(() => {
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(fixturePackage()));
  });

  it("lists the StructureDefinitions of the package from its index", async () => {
    const result = await client().structureDefinitions(PACKAGE, "1.0.0");
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(
      result.value.map(({ url, name, title, kind, type }) => ({ url, name, title, kind, type })),
    ).toEqual([
      {
        url: MODEL,
        name: "BloodPressureModel",
        title: "Blood pressure model",
        kind: "logical",
        type: MODEL,
      },
      {
        url: PROFILE,
        name: "ExampleBloodPressure",
        title: "Example BloodPressure",
        kind: "resource",
        type: "Observation",
      },
    ]);
    expect(requests).toEqual([`/registry/${PACKAGE}/1.0.0`]);
  });

  it("reads every top-level JSON file when the package has no index", async () => {
    const files = fixturePackageFiles();
    delete files["package/.index.json"];
    files["package/example/StructureDefinition-ignored.json"] = "{}";
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(tarGz(files)));
    const result = await client().structureDefinitions(PACKAGE, "1.0.0");
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(result.value.map((sd) => sd.url)).toEqual([MODEL, PROFILE]);
  });

  it("reads one StructureDefinition from the cached package", async () => {
    const fhir = client();
    expect((await fhir.structureDefinitions(PACKAGE, "1.0.0")).kind).toBe("ok");
    const result = await fhir.structureDefinition(PACKAGE, "1.0.0", PROFILE);
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(result.value.name).toBe("ExampleBloodPressure");
    expect(result.value.elements).toHaveLength(14);
    expect(requests).toHaveLength(1);
  });

  it("downloads the package again once the cache has expired", async () => {
    let time = 0;
    const fhir = client({ cacheMs: 1000, now: () => time });
    await fhir.structureDefinitions(PACKAGE, "1.0.0");
    time = 1000;
    await fhir.structureDefinitions(PACKAGE, "1.0.0");
    expect(requests).toHaveLength(2);
  });

  it("answers no_structure for a URL the package does not hold", async () => {
    expect(
      await client().structureDefinition(PACKAGE, "1.0.0", "http://example.org/fhir/nothing"),
    ).toEqual({ kind: "no_structure" });
  });

  it("answers no_snapshot for a StructureDefinition with a differential only", async () => {
    const files = fixturePackageFiles();
    const model = JSON.parse(files["package/StructureDefinition-BloodPressureModel.json"] ?? "");
    delete model.snapshot;
    files["package/StructureDefinition-BloodPressureModel.json"] = JSON.stringify(model);
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(tarGz(files)));
    expect(await client().structureDefinition(PACKAGE, "1.0.0", MODEL)).toEqual({
      kind: "no_snapshot",
    });
  });

  it("answers not_found for an unknown version", async () => {
    expect(await client().structureDefinitions(PACKAGE, "9.9.9")).toEqual({ kind: "not_found" });
  });

  it("refuses a tarball over the size cap by its declared length", async () => {
    expect(await client({ maxPackageBytes: 100 }).structureDefinitions(PACKAGE, "1.0.0")).toEqual({
      kind: "too_large",
    });
    expect(lines).toEqual(["fhir package: too_large"]);
  });

  it("refuses a tarball over the size cap that declares no length", async () => {
    routes.set(`/registry/${PACKAGE}/1.0.0`, (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/tar+gzip" });
      const body = fixturePackage();
      response.write(body.subarray(0, 200));
      response.end(body.subarray(200));
    });
    expect(await client({ maxPackageBytes: 300 }).structureDefinitions(PACKAGE, "1.0.0")).toEqual({
      kind: "too_large",
    });
  });

  it("refuses a tarball that unpacks to more than the cap", async () => {
    expect(await client({ maxUnpackedBytes: 4096 }).structureDefinitions(PACKAGE, "1.0.0")).toEqual(
      { kind: "too_large" },
    );
  });

  it("calls a body that is not a tarball unusable", async () => {
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(Buffer.from("<html>maintenance</html>")));
    expect(await client().structureDefinitions(PACKAGE, "1.0.0")).toEqual({ kind: "unusable" });
    expect(lines).toEqual(["fhir package: unusable (not_gzip)"]);
  });

  it("calls a package whose package.json names another package unusable", async () => {
    const files = fixturePackageFiles();
    files["package/package.json"] = JSON.stringify({ name: "other", version: "1.0.0" });
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(tarGz(files)));
    expect(await client().structureDefinitions(PACKAGE, "1.0.0")).toEqual({ kind: "unusable" });
  });

  it("refuses a package for another FHIR version", async () => {
    const files = fixturePackageFiles();
    files["package/package.json"] = JSON.stringify({
      name: PACKAGE,
      version: "1.0.0",
      fhirVersions: ["5.0.0"],
    });
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(tarGz(files)));
    expect(await client().structureDefinitions(PACKAGE, "1.0.0")).toEqual({ kind: "not_r4" });
  });

  it("reads the older fhir-version-list as the FHIR versions", async () => {
    const files = fixturePackageFiles();
    files["package/package.json"] = JSON.stringify({
      name: PACKAGE,
      version: "1.0.0",
      "fhir-version-list": ["4.0.1"],
    });
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(tarGz(files)));
    expect((await client().structureDefinitions(PACKAGE, "1.0.0")).kind).toBe("ok");
  });

  it("refuses a package whose fhir-version-list names another FHIR version", async () => {
    const files = fixturePackageFiles();
    files["package/package.json"] = JSON.stringify({
      name: PACKAGE,
      version: "1.0.0",
      "fhir-version-list": ["5.0.0"],
    });
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(tarGz(files)));
    expect(await client().structureDefinitions(PACKAGE, "1.0.0")).toEqual({ kind: "not_r4" });
  });

  it("takes a package without fhirVersions as R4 when it depends on the R4 core", async () => {
    const files = fixturePackageFiles();
    files["package/package.json"] = JSON.stringify({
      name: PACKAGE,
      version: "1.0.0",
      dependencies: { "hl7.fhir.r4.core": "4.0.1" },
    });
    routes.set(`/registry/${PACKAGE}/1.0.0`, bytes(tarGz(files)));
    expect((await client().structureDefinitions(PACKAGE, "1.0.0")).kind).toBe("ok");
  });

  it("refuses a malformed version without calling the registry", async () => {
    expect(await client().structureDefinitions(PACKAGE, "../x")).toEqual({ kind: "unusable" });
    expect(requests).toEqual([]);
  });
});
