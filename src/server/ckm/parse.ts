// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Reads the element list of an archetype from its AOM 1.4 XML form, as CKM serves it at
// `v1/archetypes/{cid}/xml` (docs/architecture.md, "CKM client"). Every C_COMPLEX_OBJECT with
// RM type ELEMENT in the definition becomes one entry; internal references and slots are skipped.
import { XMLParser } from "fast-xml-parser";

/** One ELEMENT node of an archetype. */
export interface ArchetypeElement {
  /** The archetype path, such as `/data[at0001]/events[at0006]/data[at0003]/items[at0004]`. */
  path: string;
  atCode: string;
  /** The term text in the archetype's original language; the at-code when it has none. */
  name: string;
  description: string;
  /**
   * The RM types the `value` attribute allows, as CKM writes them (`DV_QUANTITY`,
   * `DV_INTERVAL<DV_QUANTITY>`). Empty when the archetype leaves the value open.
   */
  rmTypes: string[];
  /** The occurrences of the node; `max` null is unbounded. Null when the XML has none. */
  occurrences: { min: number; max: number | null } | null;
}

export interface ParsedArchetype {
  archetypeId: string;
  originalLanguage: string;
  /** `description/other_details[@id="build_uid"]`, which CKM sets per revision; may be absent. */
  buildUid: string | null;
  elements: ArchetypeElement[];
}

export type ParseError = "doctype" | "malformed" | "not_an_archetype";

export type ParseResult = { ok: true; value: ParsedArchetype } | { ok: false; error: ParseError };

// Tags that may repeat; the parser returns them as arrays even when there is only one.
const REPEATING = new Set(["attributes", "children", "items", "term_definitions", "other_details"]);

const PREDEFINED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeReference(whole: string, reference: string): string {
  if (!reference.startsWith("#")) return PREDEFINED[reference] ?? whole;
  const hex = reference[1] === "x" || reference[1] === "X";
  const code = Number.parseInt(reference.slice(hex ? 2 : 1), hex ? 16 : 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
}

// NOTE: XXE (OWASP XML External Entity Prevention Cheat Sheet). The decoder knows the five
// predefined entities and character references only and drops any declared entity; a document
// with a DOCTYPE is refused before parsing as well.
const entityDecoder = {
  setExternalEntities: () => undefined,
  addInputEntities: () => undefined,
  reset: () => undefined,
  setXmlVersion: () => undefined,
  decode: (value: string) =>
    value.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,4});/g, decodeReference),
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => REPEATING.has(name),
  processEntities: true,
  entityDecoder,
});

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodes(value: unknown): Node[] {
  return Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : [];
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isNode(value) && typeof value["#text"] === "string") return value["#text"];
  return null;
}

function integer(value: unknown): number | null {
  const raw = text(value);
  if (raw === null || !/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

/** Reads an AOM 1.4 `Interval<Integer>` as min..max; null when it has no usable lower bound. */
function readOccurrences(value: unknown): ArchetypeElement["occurrences"] {
  if (!isNode(value)) return null;
  let min = text(value["lower_unbounded"]) === "true" ? 0 : integer(value["lower"]);
  if (min === null) return null;
  if (text(value["lower_included"]) === "false") min += 1;
  let max: number | null = null;
  if (text(value["upper_unbounded"]) !== "true") {
    max = integer(value["upper"]);
    if (max === null) return null;
    if (text(value["upper_included"]) === "false") max -= 1;
  }
  return { min, max };
}

/** Term text and description per at-code in one language. */
function readTerms(
  ontology: unknown,
  language: string,
): Map<string, { text: string; description: string }> {
  const terms = new Map<string, { text: string; description: string }>();
  if (!isNode(ontology)) return terms;
  const definitions = nodes(ontology["term_definitions"]).find(
    (definition) => definition["@_language"] === language,
  );
  if (!definitions) return terms;
  for (const item of nodes(definitions["items"])) {
    const code = item["@_code"];
    if (typeof code !== "string") continue;
    const fields = nodes(item["items"]);
    const field = (id: string) => text(fields.find((entry) => entry["@_id"] === id)) ?? "";
    terms.set(code, { text: field("text"), description: field("description") });
  }
  return terms;
}

/** Parses archetype XML; refuses a DOCTYPE and anything that is not an AOM 1.4 archetype. */
export function parseArchetypeXml(xml: string): ParseResult {
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) return { ok: false, error: "doctype" };
  let document: unknown;
  try {
    document = parser.parse(xml, true);
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (!isNode(document) || !isNode(document["archetype"])) {
    return { ok: false, error: "not_an_archetype" };
  }
  const archetype = document["archetype"];
  const archetypeId = isNode(archetype["archetype_id"])
    ? text(archetype["archetype_id"]["value"])
    : null;
  const language = isNode(archetype["original_language"])
    ? text(archetype["original_language"]["code_string"])
    : null;
  const definition = archetype["definition"];
  if (!archetypeId || !language || !isNode(definition)) {
    return { ok: false, error: "not_an_archetype" };
  }
  const description = archetype["description"];
  const buildUid = isNode(description)
    ? text(nodes(description["other_details"]).find((entry) => entry["@_id"] === "build_uid"))
    : null;
  const terms = readTerms(archetype["ontology"], language);
  const elements: ArchetypeElement[] = [];

  const walk = (node: Node, path: string): void => {
    for (const attribute of nodes(node["attributes"])) {
      const attributeName = text(attribute["rm_attribute_name"]);
      if (!attributeName) continue;
      for (const child of nodes(attribute["children"])) {
        // Internal references repeat a node found elsewhere; slots point to other archetypes.
        if (child["@_type"] !== "C_COMPLEX_OBJECT") continue;
        const nodeId = text(child["node_id"]) ?? "";
        const childPath = nodeId
          ? `${path}/${attributeName}[${nodeId}]`
          : `${path}/${attributeName}`;
        if (text(child["rm_type_name"]) === "ELEMENT" && nodeId) {
          elements.push(readElement(child, childPath, nodeId));
        } else {
          walk(child, childPath);
        }
      }
    }
  };

  const readElement = (node: Node, path: string, atCode: string): ArchetypeElement => {
    const value = nodes(node["attributes"]).find(
      (attribute) => text(attribute["rm_attribute_name"]) === "value",
    );
    const rmTypes = nodes(value?.["children"])
      .map((child) => text(child["rm_type_name"]))
      .filter((type): type is string => type !== null && type.length > 0);
    const term = terms.get(atCode);
    return {
      path,
      atCode,
      name: term?.text.trim() || atCode,
      description: term?.description.trim() ?? "",
      rmTypes: [...new Set(rmTypes)],
      occurrences: readOccurrences(node["occurrences"]),
    };
  };

  walk(definition, "");
  return { ok: true, value: { archetypeId, originalLanguage: language, buildUid, elements } };
}
