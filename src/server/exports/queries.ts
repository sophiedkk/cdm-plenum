// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The exports of docs/architecture.md, "Exports": built from the database on request, never
// stored, for the project's facilitator only, and logged with ids only (AD2, Q-PRIV-2).
import type { Kysely, Transaction } from "kysely";
import { formatCardinality } from "@/lib/cardinality";
import { type CsvCell, writeCsv } from "@/lib/csv";
import { dataTypeByKey, fhirTypeForRmType, isDataTypeKey } from "@/lib/data-types";
import { type MindMapNode, writeFreeMind } from "@/lib/freemind";
import { groupName } from "@/lib/i18n/labels";
import { ancestry, type TreeGroup } from "@/lib/model-tree";
import type { ModelType } from "@/lib/model-types";
import type { DB } from "../db/schema.gen.ts";
import { projectGroups } from "../details/tree.ts";
import { done, type ProjectResult, withProject } from "../projects/access.ts";
import { log } from "../projects/queries.ts";
import { modelTypeOf } from "../scope/queries.ts";
import { shownGroups } from "./rating-groups.ts";

/** A generated export: the file name to offer, its media type and its text. */
export interface ExportFile {
  filename: string;
  mediaType: string;
  content: string;
}

// NOTE: RFC 4180, section 3 registers text/csv with an optional charset parameter.
const CSV_MEDIA_TYPE = "text/csv; charset=utf-8";
// No media type is registered for FreeMind; this is the one FreeMind and Freeplane use.
const FREEMIND_MEDIA_TYPE = "application/x-freemind";

export const EXPORT = { export: ["download"] } as const;

export type Db = Kysely<DB> | Transaction<DB>;

export function fileDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface ElementRow {
  id: string;
  name: string;
  description: string;
  dataType: string | null;
  minOccurs: number | null;
  maxOccurs: number | null;
  mergedInto: string | null;
  codeSystem: string | null;
  code: string | null;
  bindingStrength: string | null;
  valueSetUrl: string | null;
  archetypeId: string | null;
  atCode: string | null;
  revision: string | null;
  rmType: string | null;
  referenceTitle: string | null;
  referenceUrl: string | null;
  groupId: string | null;
  registration: boolean;
}

// NOTE: no spec governs this, our own design: the export's columns and texts are English, as the
// header row is, so a file reads the same whoever downloads it.
/** The English name of a group: its own, or the name of the starting question for the model type. */
export function exportGroupName(group: TreeGroup, type: ModelType | null): string {
  return groupName(group, type, { locale: "en" });
}

/**
 * The tree columns of an element (DT6): the path of its group from the top of the model, as
 * `Measurement > Cuff`; that group's cardinality; the sub-block it is in, nearest first, as
 * `title <link>` or the group name for a sub-block without a link; and `yes` for a registration
 * element.
 */
function treeCells(
  groups: readonly TreeGroup[],
  element: ElementRow,
  type: ModelType | null,
): CsvCell[] {
  const path = element.groupId === null ? [] : ancestry(groups, element.groupId);
  const own = path.at(-1);
  const subBlock = [...path].reverse().find((group) => group.subBlock);
  const link = subBlock?.subBlockLink;
  return [
    path.length === 0 ? null : path.map((group) => exportGroupName(group, type)).join(" > "),
    own?.cardinality ? formatCardinality(own.cardinality) : null,
    subBlock === undefined
      ? null
      : link
        ? [link.title, link.url && `<${link.url}>`].filter(Boolean).join(" ")
        : exportGroupName(subBlock, type),
    element.registration ? "yes" : null,
  ];
}

/** Every element of the project, merged ones included, ordered by name. Never the author. */
export async function elementRows(trx: Db, projectId: string): Promise<ElementRow[]> {
  return trx
    .selectFrom("element")
    .leftJoin("element_ckm_link as link", "link.element_id", "element.id")
    .select([
      "element.id",
      "element.name",
      "element.description",
      "element.data_type as dataType",
      "element.min_occurs as minOccurs",
      "element.max_occurs as maxOccurs",
      "element.merged_into as mergedInto",
      "element.code_system as codeSystem",
      "element.code",
      "element.binding_strength as bindingStrength",
      "element.value_set_url as valueSetUrl",
      "link.archetype_id as archetypeId",
      "link.at_code as atCode",
      "link.revision",
      "link.rm_type as rmType",
      "element.reference_title as referenceTitle",
      "element.reference_url as referenceUrl",
      "element.group_id as groupId",
      "element.registration",
    ])
    .where("element.project_id", "=", projectId)
    .orderBy("element.name")
    .orderBy("element.id")
    .execute();
}

/** The element a merged element ended up in, or null when the chain loops. */
export function survivor(byId: Map<string, ElementRow>, element: ElementRow): ElementRow | null {
  const seen = new Set<string>();
  let current: ElementRow | undefined = element;
  while (current?.mergedInto) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    current = byId.get(current.mergedInto);
  }
  return current ?? null;
}

/**
 * The openEHR and FHIR type of an element: from its data type key, or else the RM type of its CKM
 * link, which has no FHIR type when it is outside the list (ADR 0009).
 */
export function types(element: ElementRow): { rmType: string | null; fhirType: string | null } {
  if (element.dataType !== null && isDataTypeKey(element.dataType)) {
    const type = dataTypeByKey(element.dataType);
    return { rmType: type.rmType, fhirType: type.fhirType };
  }
  if (element.rmType !== null) {
    return { rmType: element.rmType, fhirType: fhirTypeForRmType(element.rmType) };
  }
  return { rmType: null, fhirType: null };
}

/**
 * A code as `system|code`, the token form of FHIR search
 * (<https://hl7.org/fhir/R4/search.html#token>); null without a code.
 */
export function token(system: string | null, code: string | null): string | null {
  return system !== null && code !== null ? `${system}|${code}` : null;
}

export function cardinality(element: ElementRow): string | null {
  if (element.minOccurs !== 0 && element.minOccurs !== 1) return null;
  return formatCardinality({ min: element.minOccurs, max: element.maxOccurs });
}

/** Appends `value` to the list under `key`. */
function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Per element whether its code proposal is settled; an element without a proposal has none.
 * NOTE: DT4. Open codes do not hold up the hand-off; the exports mark them open.
 */
export async function codesStatuses(
  trx: Db,
  projectId: string,
): Promise<Map<string | null, "open" | "settled">> {
  const codeRows = await trx
    .selectFrom("detail_proposal")
    .innerJoin("element", "element.id", "detail_proposal.element_id")
    .select(["detail_proposal.element_id as elementId", "detail_proposal.settled_at"])
    .where("element.project_id", "=", projectId)
    .where("detail_proposal.kind", "=", "terminology")
    .execute();
  return new Map(
    codeRows.map((row) => [row.elementId, row.settled_at === null ? "open" : "settled"]),
  );
}

/**
 * EX1: one row per element that is not merged into another, with its types, cardinality, sources,
 * CKM link, the CKM links of merged duplicates, proposed values, its codes and binding (DT5) with
 * whether they are settled, and the outcome of each round. The
 * sources of elements merged into it are listed with its own (Q-AUDIT-1); their CKM links go in
 * `merged_ckm_links`, so the three `ckm_` columns stay the element's own link (EL5, O-5).
 * A reference element names the model it refers to in `refers_to` and `refers_to_url` (EL26).
 * The tree of the model (DT6) adds the group path, the group's cardinality, the sub-block and
 * the registration flag after them.
 */
export async function exportElementsCsv(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  now = new Date(),
): Promise<ProjectResult<ExportFile>> {
  return withProject(db, userId, projectId, EXPORT, async (trx, project) => {
    const elements = await elementRows(trx, project.id);
    const byId = new Map(elements.map((element) => [element.id, element]));

    const sourceRows = await trx
      .selectFrom("element_source")
      .innerJoin("element", "element.id", "element_source.element_id")
      .select([
        "element_source.element_id as elementId",
        "element_source.kind",
        "element_source.label",
      ])
      .where("element.project_id", "=", project.id)
      .orderBy("element_source.created_at")
      .orderBy("element_source.id")
      .execute();
    const sources = new Map<string, string[]>();
    for (const row of sourceRows) {
      const element = byId.get(row.elementId);
      const target = element && survivor(byId, element);
      if (!target) continue;
      const text = `${row.kind}: ${row.label}`;
      if (!sources.get(target.id)?.includes(text)) push(sources, target.id, text);
    }

    const mergedLinkRows = await trx
      .selectFrom("element_ckm_link as link")
      .innerJoin("element", "element.id", "link.element_id")
      .select([
        "link.element_id as elementId",
        "link.archetype_id as archetypeId",
        "link.at_code as atCode",
        "link.revision",
      ])
      .where("element.project_id", "=", project.id)
      .where("element.merged_into", "is not", null)
      .orderBy("link.linked_at")
      .orderBy("link.element_id")
      .execute();
    const mergedLinks = new Map<string, string[]>();
    for (const row of mergedLinkRows) {
      const element = byId.get(row.elementId);
      const target = element && survivor(byId, element);
      if (!target) continue;
      const text = `${row.archetypeId} ${row.atCode} (${row.revision})`;
      if (!mergedLinks.get(target.id)?.includes(text)) push(mergedLinks, target.id, text);
    }

    const valueRows = await trx
      .selectFrom("element_value")
      .innerJoin("element", "element.id", "element_value.element_id")
      .select([
        "element_value.element_id as elementId",
        "element_value.text",
        "element_value.value",
        "element_value.code_system as codeSystem",
        "element_value.code",
      ])
      .where("element.project_id", "=", project.id)
      .orderBy("element_value.element_id")
      .orderBy("element_value.position")
      .execute();
    const values = new Map<string, string[]>();
    const valueCodes = new Map<string, string[]>();
    for (const row of valueRows) {
      push(values, row.elementId, row.value === null ? row.text : `${row.text} (${row.value})`);
      push(valueCodes, row.elementId, token(row.codeSystem, row.code) ?? "");
    }

    const codesStatus = await codesStatuses(trx, project.id);

    const rounds = await trx
      .selectFrom("round")
      .select(["id", "number"])
      .where("project_id", "=", project.id)
      .where("kind", "=", "elements")
      .orderBy("number")
      .execute();
    const outcomeRows = await trx
      .selectFrom("round_element")
      .innerJoin("round", "round.id", "round_element.round_id")
      .select([
        "round_element.round_id as roundId",
        "round_element.element_id as elementId",
        "round_element.outcome",
      ])
      .where("round.project_id", "=", project.id)
      .execute();
    const outcomes = new Map(
      outcomeRows.map((row) => [`${row.roundId}/${row.elementId}`, row.outcome ?? "pending"]),
    );

    const groups = await projectGroups(trx, project.id);
    const modelType = await modelTypeOf(trx, project.id);

    const header: CsvCell[] = [
      "name",
      "description",
      "openehr_type",
      "fhir_type",
      "cardinality",
      "sources",
      "ckm_archetype_id",
      "ckm_at_code",
      "ckm_revision",
      "merged_ckm_links",
      "proposed_values",
      "element_code",
      "binding_strength",
      "value_set_url",
      "value_codes",
      "codes_status",
      "refers_to",
      "refers_to_url",
      "group_path",
      "group_cardinality",
      "group_sub_block",
      "registration",
      ...rounds.map((round) => `round_${round.number}_outcome`),
    ];
    const rows: CsvCell[][] = elements
      .filter((element) => element.mergedInto === null)
      .map((element) => {
        const { rmType, fhirType } = types(element);
        return [
          element.name,
          element.description,
          rmType,
          fhirType,
          cardinality(element),
          sources.get(element.id)?.join("; "),
          element.archetypeId,
          element.atCode,
          element.revision,
          mergedLinks.get(element.id)?.join("; "),
          values.get(element.id)?.join("; "),
          token(element.codeSystem, element.code),
          element.bindingStrength,
          element.valueSetUrl,
          valueCodes.get(element.id)?.some((code) => code !== "")
            ? valueCodes.get(element.id)?.join("; ")
            : null,
          codesStatus.get(element.id),
          element.referenceTitle,
          element.referenceUrl,
          ...treeCells(groups, element, modelType),
          ...rounds.map((round) => outcomes.get(`${round.id}/${element.id}`)),
        ];
      });

    await log(trx, userId, project.id, "export_elements_csv", "project", project.id);
    return done({
      filename: `elements-${fileDate(now)}.csv`,
      mediaType: CSV_MEDIA_TYPE,
      content: writeCsv([header, ...rows]),
    });
  });
}

/**
 * EX2: the concept as the root and one node per included element with its description. An
 * element counts as included when its outcome in the last closed round that rated it is
 * `included`. Before any round has closed, every element that is not merged is on the map. A
 * reference element links to the model it refers to and names it first in its note (EL26).
 */
export async function exportMindMap(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  now = new Date(),
): Promise<ProjectResult<ExportFile>> {
  return withProject(db, userId, projectId, EXPORT, async (trx, project) => {
    const elements = (await elementRows(trx, project.id)).filter((e) => e.mergedInto === null);

    const outcomeRows = await trx
      .selectFrom("round_element")
      .innerJoin("round", "round.id", "round_element.round_id")
      .select(["round_element.element_id as elementId", "round_element.outcome"])
      .where("round.project_id", "=", project.id)
      .where("round.closed_at", "is not", null)
      .where("round_element.outcome", "is not", null)
      .orderBy("round.number")
      .execute();
    const anyClosed = await trx
      .selectFrom("round")
      .select("id")
      .where("project_id", "=", project.id)
      .where("kind", "=", "elements")
      .where("closed_at", "is not", null)
      .executeTakeFirst();
    // Ordered by round number, so the last outcome written per element is the latest one.
    const latest = new Map(outcomeRows.map((row) => [row.elementId, row.outcome]));
    const included = anyClosed
      ? elements.filter((element) => latest.get(element.id) === "included")
      : elements;

    const scope = await trx
      .selectFrom("scope_statement")
      .select("concept")
      .where("project_id", "=", project.id)
      .executeTakeFirst();
    const concept = scope?.concept.trim() || project.name;

    const root: MindMapNode = {
      id: "root",
      text: concept,
      children: included.map((element) => ({
        id: `ID_${element.id.replaceAll("-", "")}`,
        text: element.name,
        note:
          element.referenceTitle === null
            ? element.description
            : [`Refers to: ${element.referenceTitle}`, element.description].join("\n"),
        ...(element.referenceUrl === null ? {} : { link: element.referenceUrl }),
      })),
    };

    await log(trx, userId, project.id, "export_mind_map", "project", project.id);
    return done({
      filename: `elements-${fileDate(now)}.mm`,
      mediaType: FREEMIND_MEDIA_TYPE,
      content: writeFreeMind(root),
    });
  });
}

/**
 * EX4: one row per rating of a closed round, with the participant's rating code, the stakeholder
 * group stored on the rating (empty for a group too small to name, Q-PRIV-3), the round number,
 * the element name, the score (empty for "unable to rate") and the reason. The query reads no
 * member, user, name or e-mail address.
 */
export async function exportRatingsCsv(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  now = new Date(),
): Promise<ProjectResult<ExportFile>> {
  return withProject(db, userId, projectId, EXPORT, async (trx, project) => {
    const ratings = await trx
      .selectFrom("rating")
      .innerJoin("round", "round.id", "rating.round_id")
      .innerJoin("element", "element.id", "rating.element_id")
      .leftJoin("team", (join) =>
        join
          .onRef("team.id", "=", "rating.team_id")
          .onRef("team.organizationId", "=", "round.project_id"),
      )
      .select([
        "rating.rating_code_id as code",
        "team.id as groupId",
        "team.name as groupName",
        "round.number as round",
        "element.name as element",
        "rating.score",
        "rating.reason",
      ])
      .where("round.project_id", "=", project.id)
      .where("round.closed_at", "is not", null)
      .orderBy("round.number")
      .orderBy("element.name")
      .orderBy("element.id")
      .orderBy("rating.rating_code_id")
      .execute();
    const named = shownGroups(ratings);

    const rows: CsvCell[][] = [
      ["participant_code", "stakeholder_group", "round", "element", "score", "reason"],
      ...ratings.map((rating) => [
        rating.code,
        rating.groupId !== null && named.has(rating.groupId) ? rating.groupName : null,
        rating.round,
        rating.element,
        rating.score,
        rating.reason,
      ]),
    ];

    await log(trx, userId, project.id, "export_ratings_csv", "project", project.id);
    return done({
      filename: `ratings-${fileDate(now)}.csv`,
      mediaType: CSV_MEDIA_TYPE,
      content: writeCsv(rows),
    });
  });
}
