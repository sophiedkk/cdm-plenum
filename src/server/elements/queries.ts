// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The element board (EL1, EL2, EL5, EL6, EL9). Every member adds and comments on elements; the
// facilitator edits, merges, sets proposed values and sees who wrote what. The author columns are
// selected only in the `...WithAuthors` queries, which require the facilitator (ADR 0005).
// During the private step of the brainstorm (EL13) a participant reads only their own elements
// and the comments on them; `visibleAuthor` decides that once per request.
import { type Kysely, sql, type Transaction } from "kysely";
import { type ElementPrompt, isElementPrompt } from "@/lib/brainstorm";
import type { Cardinality } from "@/lib/cardinality";
import { CODED_DATA_TYPE_KEYS, type DataTypeKey, isDataTypeKey } from "@/lib/data-types";
import type { DB } from "../db/schema.gen.ts";
import {
  done,
  type LockedProject,
  type ProjectActionError,
  type ProjectResult,
  readProject,
  refused,
  withProject,
} from "../projects/access.ts";
import { type Author, actorMemberId } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import type {
  AddElementCommentInput,
  AddElementInput,
  ElementInput,
  MergeElementsInput,
  SetElementValuesInput,
  UpdateElementInput,
} from "./schemas.ts";

export const ELEMENT_SOURCE_KINDS = ["brainstorm", "csv", "ckm", "delphi"] as const;
export type ElementSourceKind = (typeof ELEMENT_SOURCE_KINDS)[number];

export interface ElementSource {
  kind: ElementSourceKind;
  /** The participant's note, the CSV file name, the archetype id or the round number. */
  label: string;
}

export interface ElementValue {
  text: string;
  /** Set for ordinal and scale values only (EL9). */
  value: number | null;
}

/** The CKM archetype element an element is linked to (EL4, EL7). */
export interface ElementCkmLink {
  archetypeId: string;
  cid: string;
  revision: string;
  atCode: string;
  /** The term text of the archetype element in the archetype's original language. */
  ckmElementName: string;
  /** The RM type as CKM writes it; may be outside the data type list (ADR 0009). */
  rmType: string;
}

/** An element as every member sees it: no author (EL2). */
export interface BoardElement {
  id: string;
  name: string;
  description: string;
  dataType: DataTypeKey | null;
  cardinality: Cardinality | null;
  sources: ElementSource[];
  values: ElementValue[];
  ckmLink: ElementCkmLink | null;
  /**
   * The CKM links of the elements merged into this one, directly or through earlier merges, each
   * once, in the order they were linked (EL5, O-5). Provenance only: `ckmLink` stays the link.
   */
  mergedCkmLinks: ElementCkmLink[];
  /** The brainstorm question the element answers (EL14), null for an import or the board form. */
  prompt: ElementPrompt | null;
  commentCount: number;
  createdAt: string;
}

export interface BoardElementWithAuthor extends BoardElement {
  /** Null when the author left the project. */
  author: Author | null;
}

export interface ElementComment {
  id: string;
  body: string;
  createdAt: string;
}

export interface ElementCommentWithAuthor extends ElementComment {
  author: Author | null;
}

type Db = Kysely<DB> | Transaction<DB>;

/** The element columns a participant may see; `author_member_id` is not among them. */
const PUBLIC_COLUMNS = [
  "element.id",
  "element.name",
  "element.description",
  "element.data_type",
  "element.min_occurs",
  "element.max_occurs",
  "element.prompt",
  "element.created_at",
] as const;

function toCardinality(min: number | null, max: number | null): Cardinality | null {
  if (min !== 0 && min !== 1) return null;
  return { min, max };
}

function toDataType(key: string | null): DataTypeKey | null {
  return key !== null && isDataTypeKey(key) ? key : null;
}

function groupBy<T extends { element_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.element_id);
    if (list) list.push(row);
    else map.set(row.element_id, [row]);
  }
  return map;
}

interface CkmLinkRow {
  archetype_id: string;
  cid: string;
  revision: string;
  at_code: string;
  ckm_element_name: string;
  rm_type: string;
}

function toCkmLink(link: CkmLinkRow): ElementCkmLink {
  return {
    archetypeId: link.archetype_id,
    cid: link.cid,
    revision: link.revision,
    atCode: link.at_code,
    ckmElementName: link.ckm_element_name,
    rmType: link.rm_type,
  };
}

/**
 * The CKM links of merged-away elements per active element of the project. The merge points
 * earlier duplicates at the new result, but the walk follows `merged_into` to any depth, so a
 * chain still ends at the element on the board. A link that repeats one listed before is skipped.
 */
async function mergedCkmLinks(db: Db, projectId: string): Promise<Map<string, ElementCkmLink[]>> {
  const rows = await db
    .withRecursive("merged(element_id, root_id)", (db) =>
      db
        .selectFrom("element")
        .select(["element.id as element_id", "element.id as root_id"])
        .where("element.project_id", "=", projectId)
        .where("element.merged_into", "is", null)
        .union((db) =>
          db
            .selectFrom("element")
            .innerJoin("merged", "merged.element_id", "element.merged_into")
            .select(["element.id as element_id", "merged.root_id"])
            .where("element.project_id", "=", projectId),
        ),
    )
    .selectFrom("merged")
    .innerJoin("element_ckm_link as link", "link.element_id", "merged.element_id")
    .select([
      "merged.root_id",
      "link.archetype_id",
      "link.cid",
      "link.revision",
      "link.at_code",
      "link.ckm_element_name",
      "link.rm_type",
    ])
    .whereRef("merged.element_id", "!=", "merged.root_id")
    .orderBy("link.linked_at")
    .orderBy("link.element_id")
    .execute();
  const linksOf = new Map<string, ElementCkmLink[]>();
  for (const row of rows) {
    const list = linksOf.get(row.root_id) ?? [];
    const repeats = list.some(
      (link) =>
        link.archetypeId === row.archetype_id &&
        link.atCode === row.at_code &&
        link.revision === row.revision,
    );
    if (!repeats) list.push(toCkmLink(row));
    linksOf.set(row.root_id, list);
  }
  return linksOf;
}

/**
 * Whether the project is in the private step of the brainstorm (EL13): the setting is on and the
 * facilitator has not revealed the board yet.
 */
export async function inPrivateStep(db: Db, projectId: string): Promise<boolean> {
  const row = await db
    .selectFrom("project")
    .select(["private_brainstorm", "board_revealed_at"])
    .where("id", "=", projectId)
    .executeTakeFirstOrThrow();
  return row.private_brainstorm && row.board_revealed_at === null;
}

/**
 * The member whose elements `userId` may read, or null for every element (EL13). Only a
 * participant in the private step is limited, to their own member id.
 */
// NOTE: EL13, owner decision 2026-11-20. The filter runs on the server, so no response to a
// participant carries another participant's element before the reveal.
export async function visibleAuthor(
  db: Db,
  project: LockedProject,
  userId: string,
): Promise<string | null> {
  if (project.role === "facilitator") return null;
  if (!(await inPrivateStep(db, project.id))) return null;
  return actorMemberId(db, project.id, userId);
}

/**
 * The active elements of a project in the order they were added, without authors; with
 * `onlyAuthor`, only the elements of that member.
 */
async function boardElements(
  db: Db,
  projectId: string,
  onlyAuthor: string | null = null,
): Promise<BoardElement[]> {
  let query = db
    .selectFrom("element")
    .select(PUBLIC_COLUMNS)
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null);
  if (onlyAuthor !== null) query = query.where("element.author_member_id", "=", onlyAuthor);
  const rows = await query.orderBy("element.created_at").orderBy("element.id").execute();
  const sources = await db
    .selectFrom("element_source")
    .innerJoin("element", "element.id", "element_source.element_id")
    .select(["element_source.element_id", "element_source.kind", "element_source.label"])
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null)
    .orderBy("element_source.created_at")
    .orderBy("element_source.id")
    .execute();
  const values = await db
    .selectFrom("element_value")
    .innerJoin("element", "element.id", "element_value.element_id")
    .select(["element_value.element_id", "element_value.text", "element_value.value"])
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null)
    .orderBy("element_value.position")
    .execute();
  const links = await db
    .selectFrom("element_ckm_link")
    .innerJoin("element", "element.id", "element_ckm_link.element_id")
    .select([
      "element_ckm_link.element_id",
      "element_ckm_link.archetype_id",
      "element_ckm_link.cid",
      "element_ckm_link.revision",
      "element_ckm_link.at_code",
      "element_ckm_link.ckm_element_name",
      "element_ckm_link.rm_type",
    ])
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null)
    .execute();
  const mergedLinks = await mergedCkmLinks(db, projectId);
  const counts = await db
    .selectFrom("element_comment")
    .innerJoin("element", "element.id", "element_comment.element_id")
    .select(["element_comment.element_id", sql<number>`count(*)::int`.as("count")])
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null)
    .groupBy("element_comment.element_id")
    .execute();
  const sourcesOf = groupBy(sources);
  const valuesOf = groupBy(values);
  const countOf = new Map(counts.map((row) => [row.element_id, row.count]));
  const linkOf = new Map(links.map((link) => [link.element_id, toCkmLink(link)]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    dataType: toDataType(row.data_type),
    cardinality: toCardinality(row.min_occurs, row.max_occurs),
    sources: (sourcesOf.get(row.id) ?? []).map((source) => ({
      kind: source.kind as ElementSourceKind,
      label: source.label,
    })),
    values: (valuesOf.get(row.id) ?? []).map((value) => ({
      text: value.text,
      value: value.value === null ? null : Number(value.value),
    })),
    ckmLink: linkOf.get(row.id) ?? null,
    mergedCkmLinks: mergedLinks.get(row.id) ?? [],
    prompt: isElementPrompt(row.prompt) ? row.prompt : null,
    commentCount: countOf.get(row.id) ?? 0,
    createdAt: row.created_at.toISOString(),
  }));
}

/**
 * The board for any member, without authors (EL1, EL2). In the private step a participant gets
 * only their own elements (EL13).
 */
export async function listElements(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<BoardElement[]>> {
  return readProject(db, userId, projectId, null, async (db, project) =>
    done(await boardElements(db, project.id, await visibleAuthor(db, project, userId))),
  );
}

/** The elements the user added themselves, for the brainstorm page (EL14), any member. */
export async function listOwnElements(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<BoardElement[]>> {
  return readProject(db, userId, projectId, null, async (db, project) =>
    done(await boardElements(db, project.id, await actorMemberId(db, project.id, userId))),
  );
}

async function authorsOf(db: Db, memberIds: (string | null)[]): Promise<Map<string, Author>> {
  const ids = [...new Set(memberIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom("member")
    .innerJoin("user", "user.id", "member.userId")
    .select(["member.id", "user.name", "user.email"])
    .where("member.id", "in", ids)
    .execute();
  return new Map(
    rows.map((row) => [row.id, { memberId: row.id, name: row.name, email: row.email }]),
  );
}

/** The board with the author of each element (facilitator only, EL2). */
export async function listElementsWithAuthors(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<BoardElementWithAuthor[]>> {
  return readProject(db, userId, projectId, { element: ["read_authors"] }, async (db, project) => {
    const elements = await boardElements(db, project.id);
    const rows = await db
      .selectFrom("element")
      .select(["id", "author_member_id"])
      .where("project_id", "=", project.id)
      .where("merged_into", "is", null)
      .execute();
    const memberOf = new Map(rows.map((row) => [row.id, row.author_member_id]));
    const authors = await authorsOf(db, [...memberOf.values()]);
    return done(
      elements.map((element) => {
        const memberId = memberOf.get(element.id) ?? null;
        return { ...element, author: memberId === null ? null : (authors.get(memberId) ?? null) };
      }),
    );
  });
}

/**
 * An element on the board of the project (not merged away), locked when `lock` is set; with
 * `onlyAuthor`, only when that member added it (EL13).
 */
async function activeElement(
  trx: Db,
  projectId: string,
  elementId: string,
  { lock = false, onlyAuthor = null }: { lock?: boolean; onlyAuthor?: string | null } = {},
) {
  let query = trx
    .selectFrom("element")
    .select(["id", "data_type", "description"])
    .where("id", "=", elementId)
    .where("project_id", "=", projectId)
    .where("merged_into", "is", null);
  if (onlyAuthor !== null) query = query.where("author_member_id", "=", onlyAuthor);
  if (lock) query = query.forUpdate();
  return query.executeTakeFirst();
}

/** Adds an element with a `brainstorm` source (any member, EL1). */
export async function addElement(
  db: Kysely<DB>,
  userId: string,
  input: AddElementInput,
): Promise<ProjectResult<{ elementId: string }>> {
  return db.transaction().execute((trx) =>
    readProject(trx, userId, input.projectId, null, async (trx, project) => {
      const authorMemberId = await actorMemberId(trx, project.id, userId);
      const row = await trx
        .insertInto("element")
        .values({
          project_id: project.id,
          name: input.name,
          description: input.description,
          data_type: input.dataType,
          min_occurs: input.cardinality?.min ?? null,
          max_occurs: input.cardinality?.max ?? null,
          prompt: input.prompt,
          author_member_id: authorMemberId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("element_source")
        .values({ element_id: row.id, kind: "brainstorm", label: input.source })
        .execute();
      await log(trx, userId, project.id, "element_added", "element", row.id);
      return done({ elementId: row.id });
    }),
  );
}

/**
 * Why `values` do not fit an element of `dataType`, or null. Coded text has no numbers; an
 * ordinal needs an integer and a scale a number, as DV_ORDINAL.value is an Integer and
 * DV_SCALE.value a Real (openEHR RM, data types, quantity package).
 */
export function valuesProblem(
  dataType: string | null,
  values: readonly ElementValue[],
): ProjectActionError | null {
  if (values.length === 0) return null;
  if (dataType === null || !(CODED_DATA_TYPE_KEYS as readonly string[]).includes(dataType)) {
    return "values_not_allowed";
  }
  for (const { value } of values) {
    if (dataType === "coded_text" && value !== null) return "value_number_not_allowed";
    if (dataType !== "coded_text" && value === null) return "value_number_required";
    if (dataType === "ordinal" && !Number.isInteger(value)) return "value_number_not_integer";
  }
  return null;
}

async function valuesOf(trx: Db, elementId: string): Promise<ElementValue[]> {
  const rows = await trx
    .selectFrom("element_value")
    .select(["text", "value"])
    .where("element_id", "=", elementId)
    .orderBy("position")
    .execute();
  return rows.map((row) => ({
    text: row.text,
    value: row.value === null ? null : Number(row.value),
  }));
}

/**
 * Edits an element's wording, data type and cardinality (facilitator only, EL5). A data type
 * that no longer fits the element's proposed values is refused (`element_has_values`).
 */
export async function updateElement(
  db: Kysely<DB>,
  userId: string,
  input: UpdateElementInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { element: ["update"] }, async (trx, project) => {
    const element = await activeElement(trx, project.id, input.elementId, { lock: true });
    if (!element) return refused("element_not_found");
    if (valuesProblem(input.dataType, await valuesOf(trx, element.id)) !== null) {
      return refused("element_has_values");
    }
    await trx
      .updateTable("element")
      .set({
        name: input.name,
        description: input.description,
        data_type: input.dataType,
        min_occurs: input.cardinality?.min ?? null,
        max_occurs: input.cardinality?.max ?? null,
        updated_at: new Date(),
      })
      .where("id", "=", element.id)
      .execute();
    await log(trx, userId, project.id, "element_updated", "element", element.id);
    return done(null);
  });
}

async function writeValues(
  trx: Transaction<DB>,
  elementId: string,
  values: readonly ElementValue[],
): Promise<void> {
  await trx.deleteFrom("element_value").where("element_id", "=", elementId).execute();
  if (values.length === 0) return;
  await trx
    .insertInto("element_value")
    .values(
      values.map((value, position) => ({
        element_id: elementId,
        position,
        text: value.text,
        value: value.value,
      })),
    )
    .execute();
}

/** Replaces the ordered list of proposed values (facilitator only, EL9). */
export async function setElementValues(
  db: Kysely<DB>,
  userId: string,
  input: SetElementValuesInput,
): Promise<ProjectResult<null>> {
  return withProject(
    db,
    userId,
    input.projectId,
    { element: ["set_values"] },
    async (trx, project) => {
      const element = await activeElement(trx, project.id, input.elementId, { lock: true });
      if (!element) return refused("element_not_found");
      const problem = valuesProblem(element.data_type, input.values);
      if (problem !== null) return refused(problem);
      await writeValues(trx, element.id, input.values);
      await trx
        .updateTable("element")
        .set({ updated_at: new Date() })
        .where("id", "=", element.id)
        .execute();
      await log(trx, userId, project.id, "element_values_set", "element", element.id);
      return done(null);
    },
  );
}

/** Joins the descriptions that are not empty, each once, in merge order. */
function mergedDescription(descriptions: string[]): string {
  const kept: string[] = [];
  for (const text of descriptions.map((d) => d.trim())) {
    if (text !== "" && !kept.includes(text)) kept.push(text);
  }
  return kept.join("\n\n");
}

/**
 * Merges duplicates into one element (facilitator only, EL5), in one transaction. The result
 * keeps every description, source, comment and proposed value of the duplicates; each duplicate
 * gets `merged_into` and leaves the board. Refused when an element was put in a round
 * (`element_in_round`), so a rating history never moves, or when the moved values do not fit the
 * result's data type (`merge_values_conflict`). In the private step a merge of elements by
 * different authors is refused (`merge_before_reveal`, EL13).
 */
export async function mergeElements(
  db: Kysely<DB>,
  userId: string,
  input: MergeElementsInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { element: ["merge"] }, async (trx, project) => {
    const ids = [input.intoId, ...input.fromIds];
    const rows = await trx
      .selectFrom("element")
      .select(["id", "data_type", "description", "author_member_id"])
      .where("project_id", "=", project.id)
      .where("merged_into", "is", null)
      .where("id", "in", ids)
      .orderBy("id")
      .forUpdate()
      .execute();
    if (rows.length !== ids.length) return refused("element_not_found");
    // NOTE: EL13. The result keeps every description, source and comment, so before the reveal
    // a merge across authors would show one participant's words to another.
    const authors = new Set(rows.map((row) => row.author_member_id));
    if (authors.size > 1 && (await inPrivateStep(trx, project.id))) {
      return refused("merge_before_reveal");
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    const inRound = await trx
      .selectFrom("round_element")
      .select("element_id")
      .where("element_id", "in", ids)
      .executeTakeFirst();
    if (inRound) return refused("element_in_round");

    const into = byId.get(input.intoId);
    if (!into) return refused("element_not_found");
    const values: ElementValue[] = [];
    for (const id of ids) values.push(...(await valuesOf(trx, id)));
    if (valuesProblem(into.data_type, values) !== null) return refused("merge_values_conflict");

    await trx
      .updateTable("element_source")
      .set({ element_id: into.id })
      .where("element_id", "in", input.fromIds)
      .execute();
    await trx
      .updateTable("element_comment")
      .set({ element_id: into.id })
      .where("element_id", "in", input.fromIds)
      .execute();
    await trx.deleteFrom("element_value").where("element_id", "in", input.fromIds).execute();
    await writeValues(trx, into.id, values);
    const now = new Date();
    // Elements merged earlier into a duplicate now point at the result, so no chain forms.
    await trx
      .updateTable("element")
      .set({ merged_into: into.id, updated_at: now })
      .where("project_id", "=", project.id)
      .where((eb) => eb.or([eb("id", "in", input.fromIds), eb("merged_into", "in", input.fromIds)]))
      .execute();
    await trx
      .updateTable("element")
      .set({
        description: mergedDescription(ids.map((id) => byId.get(id)?.description ?? "")),
        updated_at: now,
      })
      .where("id", "=", into.id)
      .execute();
    for (const id of input.fromIds) {
      await log(trx, userId, project.id, "element_merged", "element", id);
    }
    await log(trx, userId, project.id, "element_merge_result", "element", into.id);
    return done(null);
  });
}

/**
 * Adds a comment under an element (any member, EL6). In the private step a participant comments
 * only on their own elements; another's is `element_not_found` (EL13).
 */
export async function addElementComment(
  db: Kysely<DB>,
  userId: string,
  input: AddElementCommentInput,
): Promise<ProjectResult<{ commentId: string }>> {
  return db.transaction().execute((trx) =>
    readProject(trx, userId, input.projectId, null, async (trx, project) => {
      const element = await activeElement(trx, project.id, input.elementId, {
        onlyAuthor: await visibleAuthor(trx, project, userId),
      });
      if (!element) return refused("element_not_found");
      const authorMemberId = await actorMemberId(trx, project.id, userId);
      const row = await trx
        .insertInto("element_comment")
        .values({ element_id: element.id, author_member_id: authorMemberId, body: input.body })
        .returning("id")
        .executeTakeFirstOrThrow();
      await log(trx, userId, project.id, "element_comment_added", "element_comment", row.id);
      return done({ commentId: row.id });
    }),
  );
}

/**
 * The comments under an element, oldest first, without authors (any member, EL6). In the private
 * step a participant reads only the comments on their own elements (EL13).
 */
export async function listElementComments(
  db: Kysely<DB>,
  userId: string,
  input: ElementInput,
): Promise<ProjectResult<ElementComment[]>> {
  return readProject(db, userId, input.projectId, null, async (db, project) => {
    const element = await activeElement(db, project.id, input.elementId, {
      onlyAuthor: await visibleAuthor(db, project, userId),
    });
    if (!element) return refused("element_not_found");
    const rows = await db
      .selectFrom("element_comment")
      .select(["id", "body", "created_at"])
      .where("element_id", "=", element.id)
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    return done(
      rows.map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at.toISOString() })),
    );
  });
}

/** The comments under an element with their authors (facilitator only, EL6). */
export async function listElementCommentsWithAuthors(
  db: Kysely<DB>,
  userId: string,
  input: ElementInput,
): Promise<ProjectResult<ElementCommentWithAuthor[]>> {
  return readProject(
    db,
    userId,
    input.projectId,
    { element: ["read_authors"] },
    async (db, project) => {
      const element = await activeElement(db, project.id, input.elementId);
      if (!element) return refused("element_not_found");
      const rows = await db
        .selectFrom("element_comment")
        .select(["id", "body", "created_at", "author_member_id"])
        .where("element_id", "=", element.id)
        .orderBy("created_at")
        .orderBy("id")
        .execute();
      const authors = await authorsOf(
        db,
        rows.map((row) => row.author_member_id),
      );
      return done(
        rows.map((row) => ({
          id: row.id,
          body: row.body,
          createdAt: row.created_at.toISOString(),
          author:
            row.author_member_id === null ? null : (authors.get(row.author_member_id) ?? null),
        })),
      );
    },
  );
}
