// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one module that calls CKM (ADR 0006, R-06). Every call has a timeout, reads a capped body,
// follows no redirect and returns a typed result; a log line names the call and the outcome,
// never a URL with its query and never a body. The calls are those of docs/requirements.md,
// "External sources".
import { z } from "zod";
import { getEnv } from "../env.ts";
import { type ArchetypeElement, parseArchetypeXml } from "./parse.ts";

/** The international CKM; CKM_BASE_URL overrides it. */
export const DEFAULT_CKM_BASE_URL = "https://ckm.openehr.org/ckm/rest";

/** Why a CKM call gave no answer the app can use. */
export type CkmFailure =
  | { kind: "unreachable" }
  | { kind: "timeout" }
  | { kind: "refused"; status: number }
  | { kind: "unusable" };

export type CkmResult<T> = { kind: "ok"; value: T } | CkmFailure;

/** One archetype as CKM lists it. */
export interface CkmArchetype {
  cid: string;
  archetypeId: string;
  name: string;
  status: string;
  revision: string;
}

/** The current revision of an archetype with its ELEMENT nodes. */
export interface CkmArchetypeElements extends CkmArchetype {
  originalLanguage: string;
  elements: ArchetypeElement[];
}

export interface CkmClient {
  searchArchetypes(text: string, size: number): Promise<CkmResult<CkmArchetype[]>>;
  archetypeElements(cid: string): Promise<CkmResult<CkmArchetypeElements>>;
}

export interface CkmClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxBytes?: number;
  cacheMs?: number;
  /** Most entries per cache; the oldest goes first. */
  cacheEntries?: number;
  now?: () => number;
  log?: (line: string) => void;
}

/** A CKM citeable identifier: dot-separated numbers, such as `1013.1.3574`. */
export const CID_PATTERN = /^\d{1,10}(\.\d{1,10}){1,5}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

// NOTE: CKM answers each row with more fields (docs/requirements.md, "External sources"); these
// are the ones the app uses. A row without one is an API change, so the answer is unusable.
const archetypeRow = z.object({
  cid: z.string().regex(CID_PATTERN),
  resourceMainId: z.string().min(1),
  resourceMainDisplayName: z.string(),
  status: z.string(),
  revision: z.string().min(1),
});

const archetypeRows = z.array(archetypeRow);

const archetypeInfo = archetypeRow.extend({ buildUid: z.string().optional() });

function toArchetype(row: z.infer<typeof archetypeRow>): CkmArchetype {
  return {
    cid: row.cid,
    archetypeId: row.resourceMainId,
    name: row.resourceMainDisplayName,
    status: row.status,
    revision: row.revision,
  };
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

type Fetched = { kind: "ok"; body: string } | CkmFailure;

/**
 * Creates a CKM client. `baseUrl` defaults to the international CKM; each call times out after
 * `timeoutMs` (10 s) and refuses a body over `maxBytes` (4 MiB). Answers are cached for `cacheMs`
 * (one day): searches by text and size, element lists by `cid` and revision.
 */
export function createCkmClient(options: CkmClientOptions = {}): CkmClient {
  const base = new URL((options.baseUrl ?? DEFAULT_CKM_BASE_URL).replace(/\/*$/, "/"));
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.warn(line));
  const ttl = options.cacheMs ?? DAY_MS;
  const limit = options.cacheEntries ?? 200;
  const searches = new TimedCache<CkmArchetype[]>(ttl, limit, now);
  const archetypes = new TimedCache<CkmArchetypeElements>(ttl, limit, now);

  /** GETs `path` below the base URL. `call` names the call in log lines. */
  async function get(call: string, path: string, accept: string): Promise<Fetched> {
    const url = new URL(path, base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fail = (failure: CkmFailure): CkmFailure => {
      const status = failure.kind === "refused" ? ` ${failure.status}` : "";
      log(`ckm ${call}: ${failure.kind}${status}`);
      return failure;
    };
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Accept: accept },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        return fail(controller.signal.aborted ? { kind: "timeout" } : { kind: "unreachable" });
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        return fail({ kind: "refused", status: response.status });
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > maxBytes || !response.body) {
        await response.body?.cancel().catch(() => undefined);
        return fail({ kind: "unusable" });
      }
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
            return fail({ kind: "unusable" });
          }
          chunks.push(value);
        }
      } catch {
        return fail(controller.signal.aborted ? { kind: "timeout" } : { kind: "unreachable" });
      }
      const body = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
      return { kind: "ok", body };
    } finally {
      clearTimeout(timer);
    }
  }

  async function getJson<T>(
    call: string,
    path: string,
    schema: z.ZodType<T>,
  ): Promise<CkmResult<T>> {
    const fetched = await get(call, path, "application/json");
    if (fetched.kind !== "ok") return fetched;
    let data: unknown;
    try {
      data = JSON.parse(fetched.body);
    } catch {
      log(`ckm ${call}: unusable (not JSON)`);
      return { kind: "unusable" };
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      log(`ckm ${call}: unusable (unexpected shape)`);
      return { kind: "unusable" };
    }
    return { kind: "ok", value: parsed.data };
  }

  return {
    async searchArchetypes(text, size) {
      const searchText = text.trim().replace(/\s+/g, " ");
      const key = `${size}:${searchText.toLowerCase()}`;
      const cached = searches.get(key);
      if (cached) return { kind: "ok", value: cached };
      const query = new URLSearchParams({
        "search-text": searchText,
        "restrict-search-to-main-data": "true",
        "sort-key": "RELEVANCE",
        size: String(size),
      });
      const result = await getJson("search", `v1/archetypes?${query}`, archetypeRows);
      if (result.kind !== "ok") return result;
      const value = result.value.map(toArchetype);
      searches.set(key, value);
      return { kind: "ok", value };
    },

    async archetypeElements(cid) {
      if (!CID_PATTERN.test(cid)) return { kind: "unusable" };
      // The XML carries no revision, so the current one comes from the archetype's row first.
      const info = await getJson("archetype", `v1/archetypes/${cid}`, archetypeInfo);
      if (info.kind !== "ok") return info;
      if (info.value.cid !== cid) {
        log("ckm archetype: unusable (other cid)");
        return { kind: "unusable" };
      }
      const key = `${cid}@${info.value.revision}`;
      const cached = archetypes.get(key);
      if (cached) return { kind: "ok", value: cached };
      const fetched = await get("archetype xml", `v1/archetypes/${cid}/xml`, "application/xml");
      if (fetched.kind !== "ok") return fetched;
      const parsed = parseArchetypeXml(fetched.body);
      if (!parsed.ok) {
        log(`ckm archetype xml: unusable (${parsed.error})`);
        return { kind: "unusable" };
      }
      // A revision published between the two calls would pair the XML with the wrong revision.
      const sameBuild =
        parsed.value.buildUid === null ||
        info.value.buildUid === undefined ||
        parsed.value.buildUid === info.value.buildUid;
      if (parsed.value.archetypeId !== info.value.resourceMainId || !sameBuild) {
        log("ckm archetype xml: unusable (does not match the archetype row)");
        return { kind: "unusable" };
      }
      const value: CkmArchetypeElements = {
        ...toArchetype(info.value),
        originalLanguage: parsed.value.originalLanguage,
        elements: parsed.value.elements,
      };
      archetypes.set(key, value);
      return { kind: "ok", value };
    },
  };
}

let shared: CkmClient | undefined;

/** The server's CKM client, on CKM_BASE_URL or the international CKM, created on first use. */
export function getCkmClient(): CkmClient {
  const baseUrl = getEnv().CKM_BASE_URL;
  shared ??= createCkmClient(baseUrl === undefined ? {} : { baseUrl });
  return shared;
}
