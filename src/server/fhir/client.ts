// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one module that calls the FHIR package registry (ADR 0011). Every call has a timeout,
// reads a capped body, follows no redirect and returns a typed result; a log line names the
// call and the outcome, never a URL and never a body. The calls are those of
// docs/requirements.md, "External sources", on the package format of
// <https://hl7.org/fhir/packages.html>.
import { z } from "zod";
import { getEnv } from "../env.ts";
import {
  type FhirStructure,
  type FhirStructureSummary,
  parseStructureDefinition,
  parseStructureSummary,
} from "./parse.ts";
import { readTarGz } from "./tar.ts";

/** The public FHIR package registry; FHIR_REGISTRY_URL overrides it. */
export const DEFAULT_FHIR_REGISTRY_URL = "https://packages.fhir.org";

/** Why a registry call gave no answer the app can use. */
export type FhirFailure =
  | { kind: "unreachable" }
  | { kind: "timeout" }
  | { kind: "not_found" }
  | { kind: "no_structure" }
  | { kind: "refused"; status: number }
  | { kind: "too_large" }
  | { kind: "unusable" }
  | { kind: "not_r4" }
  | { kind: "no_snapshot" };

export type FhirResult<T> = { kind: "ok"; value: T } | FhirFailure;

/** One package as the registry's catalog lists it. */
export interface FhirPackage {
  name: string;
  description: string;
  fhirVersion: string;
}

/** One published version of a package. */
export interface FhirPackageVersion {
  version: string;
  fhirVersion: string | null;
}

export interface FhirClient {
  searchPackages(text: string): Promise<FhirResult<FhirPackage[]>>;
  /** The versions of a package, the newest first. */
  packageVersions(name: string): Promise<FhirResult<FhirPackageVersion[]>>;
  /** The StructureDefinitions of one package version, sorted by URL. */
  structureDefinitions(name: string, version: string): Promise<FhirResult<FhirStructureSummary[]>>;
  /** One StructureDefinition of a package version, by canonical URL, with its elements. */
  structureDefinition(
    name: string,
    version: string,
    url: string,
  ): Promise<FhirResult<FhirStructure>>;
}

export interface FhirClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  /** The largest JSON answer of the registry. */
  maxJsonBytes?: number;
  /** The largest package tarball, compressed. */
  maxPackageBytes?: number;
  /** The most a package tarball may unpack to. */
  maxUnpackedBytes?: number;
  cacheMs?: number;
  /** Most package versions kept in memory; the oldest goes first. */
  cacheEntries?: number;
  now?: () => number;
  log?: (line: string) => void;
}

/** A package name: lowercase or uppercase letters, digits, dots, dashes and underscores. */
export const PACKAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,213}$/;
/** A package version, such as `4.0.1` or `0.12.1-beta.1`. */
export const PACKAGE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIB = 1024 * 1024;

// NOTE: the catalog answers each row with more fields; these are the ones the app uses. A row
// without one is an API change, so the answer is unusable.
const catalogRows = z.array(
  z.object({
    Name: z.string().regex(PACKAGE_NAME_PATTERN),
    Description: z.string().nullish(),
    FhirVersion: z.string().nullish(),
  }),
);

const versionList = z.object({
  name: z.string(),
  versions: z.record(
    z.string(),
    z.object({ version: z.string().optional(), fhirVersion: z.string().nullish() }),
  ),
});

// NOTE: https://hl7.org/fhir/packages.html: package.json names the FHIR versions in
// `fhirVersions`, "in some older packages" `fhir-version-list`; older packages only depend on
// the core package of their version.
const packageManifest = z.object({
  name: z.string(),
  version: z.string(),
  fhirVersions: z.array(z.string()).optional(),
  "fhir-version-list": z.array(z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
});

function isR4(manifest: z.infer<typeof packageManifest>): boolean {
  const versions = manifest.fhirVersions ?? manifest["fhir-version-list"];
  if (versions !== undefined) {
    return versions.some((version) => /^4\.0(\.|$)/.test(version));
  }
  return manifest.dependencies?.["hl7.fhir.r4.core"] !== undefined;
}

/** Compares two package versions by semantic versioning precedence, the newest first. */
export function compareVersionsDescending(a: string, b: string): number {
  const split = (version: string) => {
    const [main = "", ...pre] = version.split("+")[0]?.split("-") ?? [];
    return { main: main.split("."), pre: pre.join("-") };
  };
  const left = split(a);
  const right = split(b);
  const part = (x: string | undefined, y: string | undefined): number => {
    const nx = /^\d+$/.test(x ?? "") ? Number(x) : null;
    const ny = /^\d+$/.test(y ?? "") ? Number(y) : null;
    if (nx !== null && ny !== null) return nx - ny;
    if (nx !== null) return -1;
    if (ny !== null) return 1;
    return (x ?? "").localeCompare(y ?? "");
  };
  for (let i = 0; i < Math.max(left.main.length, right.main.length); i++) {
    const order = part(left.main[i] ?? "0", right.main[i] ?? "0");
    if (order !== 0) return -order;
  }
  if (left.pre === right.pre) return 0;
  // A release ranks above its pre-releases (Semantic Versioning 2.0.0, item 11).
  if (left.pre === "") return -1;
  if (right.pre === "") return 1;
  const lp = left.pre.split(".");
  const rp = right.pre.split(".");
  for (let i = 0; i < Math.max(lp.length, rp.length); i++) {
    if (lp[i] === undefined) return 1;
    if (rp[i] === undefined) return -1;
    const order = part(lp[i], rp[i]);
    if (order !== 0) return -order;
  }
  return 0;
}

class TimedCache<T> {
  readonly #entries = new Map<string, { expires: number; value: T }>();
  readonly #ttl: number;
  readonly #limit: number;
  readonly #now: () => number;

  constructor(ttl: number, limit: number, now: () => number) {
    this.#ttl = ttl;
    this.#limit = limit;
    this.#now = now;
  }

  get(key: string): T | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.#entries.delete(key);
    this.#entries.set(key, { expires: this.#now() + this.#ttl, value });
    while (this.#entries.size > this.#limit) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }
}

/** A package version read once: its StructureDefinitions and their source files. */
interface CachedPackage {
  summaries: FhirStructureSummary[];
  /** The StructureDefinition files by canonical URL, kept as bytes: smaller than parsed JSON. */
  definitions: Map<string, Buffer>;
}

type Fetched = { kind: "ok"; body: Buffer } | FhirFailure;

/** A top-level file of the package folder, where the spec puts the conformance resources. */
function isPackageJson(name: string): boolean {
  return /^(\.\/)?package\/[^/]+\.json$/.test(name);
}

function baseName(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

/**
 * Creates a registry client. `baseUrl` defaults to packages.fhir.org; each call times out after
 * `timeoutMs` (30 s). A JSON answer over `maxJsonBytes` (4 MiB), a tarball over
 * `maxPackageBytes` (32 MiB) or one that unpacks to more than `maxUnpackedBytes` (160 MiB) is
 * refused as `too_large`. A package version is immutable once published, so the
 * StructureDefinitions of the last `cacheEntries` (4) versions read stay in memory for
 * `cacheMs` (one day).
 */
export function createFhirClient(options: FhirClientOptions = {}): FhirClient {
  const base = new URL((options.baseUrl ?? DEFAULT_FHIR_REGISTRY_URL).replace(/\/*$/, "/"));
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxJsonBytes = options.maxJsonBytes ?? 4 * MIB;
  const maxPackageBytes = options.maxPackageBytes ?? 32 * MIB;
  const maxUnpackedBytes = options.maxUnpackedBytes ?? 160 * MIB;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.warn(line));
  const packages = new TimedCache<CachedPackage>(
    options.cacheMs ?? DAY_MS,
    options.cacheEntries ?? 4,
    now,
  );

  const fail = (call: string, failure: FhirFailure, detail = ""): FhirFailure => {
    const status = failure.kind === "refused" ? ` ${failure.status}` : "";
    log(`fhir ${call}: ${failure.kind}${status}${detail}`);
    return failure;
  };

  /** GETs `path` below the base URL with a body of at most `maxBytes`. */
  async function get(
    call: string,
    path: string,
    accept: string,
    maxBytes: number,
  ): Promise<Fetched> {
    const url = new URL(path, base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Accept: accept },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        return fail(
          call,
          controller.signal.aborted ? { kind: "timeout" } : { kind: "unreachable" },
        );
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 404) return fail(call, { kind: "not_found" });
        return fail(call, { kind: "refused", status: response.status });
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        return fail(call, { kind: "too_large" });
      }
      if (!response.body) return fail(call, { kind: "unusable" });
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel().catch(() => undefined);
            return fail(call, { kind: "too_large" });
          }
          chunks.push(value);
        }
      } catch {
        return fail(
          call,
          controller.signal.aborted ? { kind: "timeout" } : { kind: "unreachable" },
        );
      }
      return { kind: "ok", body: Buffer.concat(chunks) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function getJson<T>(
    call: string,
    path: string,
    schema: z.ZodType<T>,
  ): Promise<FhirResult<T>> {
    const fetched = await get(call, path, "application/json", maxJsonBytes);
    if (fetched.kind !== "ok") return fetched;
    let data: unknown;
    try {
      data = JSON.parse(fetched.body.toString("utf8"));
    } catch {
      return fail(call, { kind: "unusable" }, " (not JSON)");
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) return fail(call, { kind: "unusable" }, " (unexpected shape)");
    return { kind: "ok", value: parsed.data };
  }

  /** Downloads and reads one package version, or answers from the cache. */
  async function readPackage(name: string, version: string): Promise<FhirResult<CachedPackage>> {
    if (!PACKAGE_NAME_PATTERN.test(name) || !PACKAGE_VERSION_PATTERN.test(version)) {
      return { kind: "unusable" };
    }
    const key = `${name}@${version}`;
    const cached = packages.get(key);
    if (cached) return { kind: "ok", value: cached };
    const path = `${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const fetched = await get("package", path, "application/tar+gzip", maxPackageBytes);
    if (fetched.kind !== "ok") return fetched;
    const unpacked = readTarGz(fetched.body, maxUnpackedBytes, isPackageJson);
    if (!unpacked.ok) {
      if (unpacked.error === "too_large") return fail("package", { kind: "too_large" });
      return fail("package", { kind: "unusable" }, ` (${unpacked.error})`);
    }
    const files = new Map<string, Buffer>();
    for (const [file, body] of unpacked.files) files.set(baseName(file), body);
    const json = (file: string): unknown => {
      const body = files.get(file);
      if (body === undefined) return undefined;
      try {
        return JSON.parse(body.toString("utf8"));
      } catch {
        return undefined;
      }
    };
    const manifest = packageManifest.safeParse(json("package.json"));
    if (!manifest.success || manifest.data.name !== name || manifest.data.version !== version) {
      return fail("package", { kind: "unusable" }, " (package.json)");
    }
    if (!isR4(manifest.data)) return fail("package", { kind: "not_r4" });
    // NOTE: .index.json lists each file's resourceType (https://hl7.org/fhir/packages.html,
    // "The .index.json file"); without one every top-level JSON file is read.
    const index = z
      .object({ files: z.array(z.object({ filename: z.string(), resourceType: z.string() })) })
      .safeParse(json(".index.json"));
    const candidates = index.success
      ? index.data.files
          .filter((entry) => entry.resourceType === "StructureDefinition")
          .map((entry) => entry.filename)
      : [...files.keys()].filter((file) => file !== "package.json" && file !== ".index.json");
    const summaries: FhirStructureSummary[] = [];
    const definitions = new Map<string, Buffer>();
    for (const file of candidates) {
      const parsed = parseStructureSummary(json(file));
      const body = files.get(file);
      if (!parsed.ok || body === undefined || definitions.has(parsed.value.url)) continue;
      summaries.push(parsed.value);
      definitions.set(parsed.value.url, body);
    }
    summaries.sort((a, b) => a.url.localeCompare(b.url));
    const value = { summaries, definitions };
    packages.set(key, value);
    return { kind: "ok", value };
  }

  return {
    async searchPackages(text) {
      // NOTE: the Nictiz zib2020 and nl-core packages are all prereleases, which the catalog
      // leaves out unless `prerelease=true` is sent.
      const query = new URLSearchParams({
        name: text.trim(),
        fhirversion: "R4",
        prerelease: "true",
      });
      const result = await getJson("search", `catalog?${query}`, catalogRows);
      if (result.kind !== "ok") return result;
      return {
        kind: "ok",
        value: result.value.map((row) => ({
          name: row.Name,
          description: row.Description ?? "",
          fhirVersion: row.FhirVersion ?? "",
        })),
      };
    },

    async packageVersions(name) {
      if (!PACKAGE_NAME_PATTERN.test(name)) return { kind: "unusable" };
      const result = await getJson("versions", encodeURIComponent(name), versionList);
      if (result.kind !== "ok") return result;
      const value = Object.entries(result.value.versions)
        .filter(([version]) => PACKAGE_VERSION_PATTERN.test(version))
        .map(([version, entry]) => ({ version, fhirVersion: entry.fhirVersion ?? null }))
        .sort((a, b) => compareVersionsDescending(a.version, b.version));
      return { kind: "ok", value };
    },

    async structureDefinitions(name, version) {
      const read = await readPackage(name, version);
      return read.kind === "ok" ? { kind: "ok", value: read.value.summaries } : read;
    },

    async structureDefinition(name, version, url) {
      const read = await readPackage(name, version);
      if (read.kind !== "ok") return read;
      const body = read.value.definitions.get(url);
      if (body === undefined) return { kind: "no_structure" };
      const parsed = parseStructureDefinition(JSON.parse(body.toString("utf8")));
      if (!parsed.ok) return fail("structure", { kind: "unusable" });
      if (!parsed.value.hasSnapshot) return { kind: "no_snapshot" };
      return { kind: "ok", value: parsed.value };
    },
  };
}

let shared: FhirClient | undefined;

/** The server's registry client, on FHIR_REGISTRY_URL or packages.fhir.org, created on first use. */
export function getFhirClient(): FhirClient {
  const baseUrl = getEnv().FHIR_REGISTRY_URL;
  shared ??= createFhirClient(baseUrl === undefined ? {} : { baseUrl });
  return shared;
}
