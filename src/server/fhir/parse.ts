// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Reads FHIR R4 StructureDefinitions (<https://hl7.org/fhir/R4/structuredefinition.html>) into
// the summary a facilitator picks from and the element list an import uses. Each snapshot
// element (<https://hl7.org/fhir/R4/elementdefinition.html>) keeps its id, cardinality, type
// codes, element codes, binding and mappings; FHIR infrastructure is left out.
import { z } from "zod";

/** A coding: the system and the code, as `ElementDefinition.code` carries them. */
export interface FhirCoding {
  system: string;
  code: string;
  display: string | null;
}

/** The binding strengths of R4 (<https://hl7.org/fhir/R4/terminologies.html#binding>). */
export const BINDING_STRENGTHS = ["required", "extensible", "preferred", "example"] as const;
export type BindingStrength = (typeof BINDING_STRENGTHS)[number];

/** One element of a StructureDefinition snapshot, as the app keeps it. */
export interface FhirElement {
  /** `ElementDefinition.id`, which keeps slice names: `Observation.component:systolic`. */
  id: string;
  /** `ElementDefinition.path`, without slice names: `Observation.component`. */
  path: string;
  sliceName: string | null;
  /** `short`, or the last part of the path when there is none. */
  name: string;
  definition: string;
  min: number | null;
  /** `max` as a number; null is unbounded (`*`). */
  max: number | null;
  /** The type codes, such as `Quantity` or `CodeableConcept`; empty for a content reference. */
  types: string[];
  /** `ElementDefinition.code`, or the pattern of the element's own `.code` child (see below). */
  codes: FhirCoding[];
  binding: { strength: BindingStrength; valueSet: string | null } | null;
  mappings: { identity: string; map: string }[];
  /** The zib concept id from a mapping, such as `NL-CM:12.4.2`, or null. */
  nlCmId: string | null;
}

/** The zib a StructureDefinition maps to, from its mapping on zibs.nl. */
export interface ZibReference {
  name: string;
  version: string;
}

/** What a package lists about one StructureDefinition. */
export interface FhirStructureSummary {
  url: string;
  name: string;
  title: string | null;
  /** `primitive-type`, `complex-type`, `resource` or `logical`. */
  kind: string;
  type: string;
  derivation: string | null;
  version: string | null;
  hasSnapshot: boolean;
  zib: ZibReference | null;
}

export interface FhirStructure extends FhirStructureSummary {
  elements: FhirElement[];
}

const coding = z.object({
  system: z.string().optional(),
  code: z.string().optional(),
  display: z.string().optional(),
});

const codeableConcept = z.object({ coding: z.array(coding).optional() });

const elementDefinition = z.object({
  id: z.string().optional(),
  path: z.string().min(1),
  sliceName: z.string().optional(),
  short: z.string().optional(),
  definition: z.string().optional(),
  min: z.number().int().nonnegative().optional(),
  max: z.string().optional(),
  type: z.array(z.object({ code: z.string() })).optional(),
  code: z.array(coding).optional(),
  patternCodeableConcept: codeableConcept.optional(),
  fixedCodeableConcept: codeableConcept.optional(),
  binding: z.object({ strength: z.string(), valueSet: z.string().optional() }).optional(),
  mapping: z.array(z.object({ identity: z.string(), map: z.string() })).optional(),
});
type ElementDefinition = z.infer<typeof elementDefinition>;

const structureDefinition = z.object({
  resourceType: z.literal("StructureDefinition"),
  url: z.string().min(1),
  name: z.string().min(1),
  title: z.string().optional(),
  version: z.string().optional(),
  kind: z.string().min(1),
  type: z.string().min(1),
  derivation: z.string().optional(),
  mapping: z
    .array(
      z.object({ identity: z.string(), uri: z.string().optional(), name: z.string().optional() }),
    )
    .optional(),
  snapshot: z.object({ element: z.array(z.unknown()) }).optional(),
});
type StructureDefinition = z.infer<typeof structureDefinition>;

export type FhirParseResult<T> = { ok: true; value: T } | { ok: false; error: "unusable" };

// NOTE: the zib FHIR profiles name their zib in a StructureDefinition.mapping whose uri is the
// zib's wiki page, such as https://zibs.nl/wiki/BloodPressure-v3.2.1(2020EN). Our own reading.
const ZIB_URI = /^https?:\/\/zibs\.nl\/wiki\/([A-Za-z0-9]+)-v([0-9][^/?#]*)$/;
const NL_CM = /^NL-CM:\d+(\.\d+)+$/;

function zibReference(sd: StructureDefinition): ZibReference | null {
  for (const mapping of sd.mapping ?? []) {
    const match = ZIB_URI.exec(mapping.uri ?? "");
    if (match?.[1] && match[2]) return { name: match[1], version: decodeURIComponent(match[2]) };
  }
  return null;
}

function summary(sd: StructureDefinition): FhirStructureSummary {
  return {
    url: sd.url,
    name: sd.name,
    title: sd.title ?? null,
    kind: sd.kind,
    type: sd.type,
    derivation: sd.derivation ?? null,
    version: sd.version ?? null,
    hasSnapshot: sd.snapshot !== undefined,
    zib: zibReference(sd),
  };
}

/** The summary of a StructureDefinition resource, or `unusable` for anything else. */
export function parseStructureSummary(json: unknown): FhirParseResult<FhirStructureSummary> {
  const parsed = structureDefinition.safeParse(json);
  return parsed.success
    ? { ok: true, value: summary(parsed.data) }
    : { ok: false, error: "unusable" };
}

// NOTE: Resource (id, meta, implicitRules, language) and DomainResource (text, contained,
// extension, modifierExtension) carry no clinical content (https://hl7.org/fhir/R4/resource.html,
// https://hl7.org/fhir/R4/domainresource.html); they are left out at the top of a resource.
const RESOURCE_INFRASTRUCTURE = new Set([
  "id",
  "meta",
  "implicitRules",
  "language",
  "text",
  "contained",
  "extension",
  "modifierExtension",
]);
// NOTE: Element.id, Element.extension and BackboneElement.modifierExtension sit on every element
// at every depth (https://hl7.org/fhir/R4/element.html), so they are left out everywhere.
const ELEMENT_INFRASTRUCTURE = new Set(["id", "extension", "modifierExtension"]);

/** Whether the element is infrastructure of a `kind` StructureDefinition. */
function isInfrastructure(path: string, kind: string): boolean {
  const parts = path.split(".");
  const last = parts.at(-1) ?? "";
  if (parts.length < 2) return false;
  if (ELEMENT_INFRASTRUCTURE.has(last)) return true;
  return kind === "resource" && parts.length === 2 && RESOURCE_INFRASTRUCTURE.has(last);
}

function codings(concept: z.infer<typeof codeableConcept> | undefined): FhirCoding[] {
  return (concept?.coding ?? []).flatMap((c) =>
    c.system && c.code ? [{ system: c.system, code: c.code, display: c.display ?? null }] : [],
  );
}

function maxOf(max: string | undefined): number | null | "invalid" {
  if (max === undefined || max === "*") return null;
  return /^\d+$/.test(max) ? Number(max) : "invalid";
}

function isBindingStrength(value: string): value is BindingStrength {
  return (BINDING_STRENGTHS as readonly string[]).includes(value);
}

/**
 * The elements of a snapshot, in snapshot order, without:
 * - the root element, which is the model itself;
 * - infrastructure (see above) and every element below it;
 * - elements a profile prohibits (`max` 0) and every element below them;
 * - re-slices (`sliceName` with a `/`), which have no simple path.
 * Slices stay, with their name in the id (`Observation.component:systolic.value[x]`).
 */
function snapshotElements(sd: StructureDefinition): FhirParseResult<FhirElement[]> {
  const raw: ElementDefinition[] = [];
  for (const item of sd.snapshot?.element ?? []) {
    const parsed = elementDefinition.safeParse(item);
    if (!parsed.success) return { ok: false, error: "unusable" };
    raw.push(parsed.data);
  }
  const dropped: string[] = [];
  const kept: FhirElement[] = [];
  const byId = new Map<string, FhirElement>();
  for (const element of raw) {
    const id = element.id ?? element.path;
    const below = dropped.some(
      (prefix) => id.startsWith(`${prefix}.`) || id.startsWith(`${prefix}:`),
    );
    const max = maxOf(element.max);
    if (max === "invalid") return { ok: false, error: "unusable" };
    if (
      below ||
      isInfrastructure(element.path, sd.kind) ||
      max === 0 ||
      element.sliceName?.includes("/")
    ) {
      dropped.push(id);
      continue;
    }
    if (!element.path.includes(".")) continue;
    const strength = element.binding?.strength;
    const nlCm = (element.mapping ?? []).find((mapping) => NL_CM.test(mapping.map));
    const parsed: FhirElement = {
      id,
      path: element.path,
      sliceName: element.sliceName ?? null,
      name: element.short?.trim() || (element.path.split(".").at(-1) ?? element.path),
      definition: element.definition ?? "",
      min: element.min ?? null,
      max,
      types: (element.type ?? []).map((type) => type.code),
      codes: (element.code ?? []).flatMap((c) =>
        c.system && c.code ? [{ system: c.system, code: c.code, display: c.display ?? null }] : [],
      ),
      binding:
        strength !== undefined && isBindingStrength(strength)
          ? { strength, valueSet: element.binding?.valueSet ?? null }
          : null,
      mappings: (element.mapping ?? []).map(({ identity, map }) => ({ identity, map })),
      nlCmId: nlCm?.map ?? null,
    };
    kept.push(parsed);
    byId.set(id, parsed);
    // NOTE: an Observation profile states what a component or the observation means with a
    // pattern on its `code` child, as the zib profiles do; that coding becomes the parent's
    // element code when the parent has none of its own. Our own design.
    if (element.path.endsWith(".code")) {
      const parent = byId.get(id.slice(0, -".code".length));
      const pattern = codings(element.patternCodeableConcept ?? element.fixedCodeableConcept);
      if (parent && parent.codes.length === 0 && pattern.length > 0) parent.codes = pattern;
    }
  }
  return { ok: true, value: kept };
}

/** A StructureDefinition with its snapshot elements, or `unusable`. */
export function parseStructureDefinition(json: unknown): FhirParseResult<FhirStructure> {
  const parsed = structureDefinition.safeParse(json);
  if (!parsed.success) return { ok: false, error: "unusable" };
  const elements = snapshotElements(parsed.data);
  if (!elements.ok) return elements;
  return { ok: true, value: { ...summary(parsed.data), elements: elements.value } };
}
