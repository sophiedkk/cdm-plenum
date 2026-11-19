// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Linking candidate elements to CKM archetype elements (EL4) and importing an archetype's
// elements as candidates (EL7), for the project's facilitator only. The role is checked before
// CKM is called, and again in the transaction that writes; no transaction waits on CKM (R-06).
import type { Kysely, Transaction } from "kysely";
import { cardinalityError } from "@/lib/cardinality";
import { DATA_TYPES, type DataTypeKey } from "@/lib/data-types";
import { isProjectRole, type ProjectPermission, projectCan } from "@/lib/project-roles";
import type { DB } from "../db/schema.gen.ts";
import { type LockedProject, lockProject, type ProjectActionError } from "../projects/access.ts";
import { log } from "../projects/queries.ts";
import type { CkmArchetype, CkmArchetypeElements, CkmClient, CkmFailure } from "./client.ts";
import type { ArchetypeElement } from "./parse.ts";
import type {
  ArchetypeInput,
  ImportArchetypeInput,
  LinkElementInput,
  SearchCkmInput,
} from "./schemas.ts";

/** Why a CKM action was refused, beyond the project codes; the screens translate each code. */
export const CKM_ACTION_ERRORS = [
  "element_not_found",
  "ckm_unreachable",
  "ckm_timeout",
  "ckm_refused",
  "ckm_unusable",
  "ckm_revision_changed",
  "ckm_element_not_found",
  "ckm_no_elements",
  "ckm_already_imported",
] as const;
export type CkmActionError = ProjectActionError | (typeof CKM_ACTION_ERRORS)[number];

/** The outcome of a CKM action; `status` is CKM's HTTP status with `ckm_refused`. */
export type CkmActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CkmActionError; status?: number };

function refused<T>(error: CkmActionError): CkmActionResult<T> {
  return { ok: false, error };
}

function ckmRefused<T>(failure: CkmFailure): CkmActionResult<T> {
  if (failure.kind === "refused")
    return { ok: false, error: "ckm_refused", status: failure.status };
  return refused(`ckm_${failure.kind}`);
}

/**
 * The RM type an element link stores: the one type CKM names, the allowed types joined with
 * ` | ` for a choice, or `DATA_VALUE` when the archetype leaves the value open.
 */
export function linkRmType(rmTypes: readonly string[]): string {
  // NOTE: no spec governs this, our own design. DATA_VALUE is the RM type of ELEMENT.value
  // (openEHR RM data structures), which an unconstrained value allows in full.
  return rmTypes.length === 0 ? "DATA_VALUE" : rmTypes.join(" | ");
}

/** The data type key for an element with exactly one RM type in the list (ADR 0009), or null. */
export function dataTypeForRmTypes(rmTypes: readonly string[]): DataTypeKey | null {
  if (rmTypes.length !== 1) return null;
  return DATA_TYPES.find((type) => type.rmType === rmTypes[0])?.key ?? null;
}

/** Occurrences as an element cardinality, or null when they do not fit one (EL1). */
function cardinality(element: ArchetypeElement): { min: number; max: number | null } | null {
  const occurrences = element.occurrences;
  if (!occurrences || cardinalityError(occurrences.min, occurrences.max) !== null) return null;
  return occurrences;
}

/** Refuses a user who is no member (`not_found`) or lacks `permission` (`forbidden`). */
async function checkRole(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  permission: ProjectPermission,
): Promise<CkmActionError | null> {
  const row = await db
    .selectFrom("member")
    .innerJoin("project", "project.id", "member.organizationId")
    .select("member.role")
    .where("member.organizationId", "=", projectId)
    .where("member.userId", "=", userId)
    .executeTakeFirst();
  if (!row || !isProjectRole(row.role)) return "not_found";
  if (!projectCan(row.role, permission)) return "forbidden";
  return null;
}

/** Runs `action` in one transaction on the locked project, after the same role checks. */
async function withProject<T>(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  permission: ProjectPermission,
  action: (trx: Transaction<DB>, project: LockedProject) => Promise<CkmActionResult<T>>,
): Promise<CkmActionResult<T>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, projectId, userId);
    if (!project) return refused<T>("not_found");
    if (!projectCan(project.role, permission)) return refused<T>("forbidden");
    return action(trx, project);
  });
}

/** Searches CKM archetypes (EL4). */
export async function searchCkm(
  db: Kysely<DB>,
  ckm: CkmClient,
  userId: string,
  input: SearchCkmInput,
): Promise<CkmActionResult<CkmArchetype[]>> {
  const denied = await checkRole(db, userId, input.projectId, { ckm: ["search"] });
  if (denied) return refused(denied);
  const result = await ckm.searchArchetypes(input.text, input.size);
  return result.kind === "ok" ? { ok: true, value: result.value } : ckmRefused(result);
}

/** An archetype element with the data type key it would get (null: kept as RM type only). */
export interface CkmElementView extends ArchetypeElement {
  dataType: DataTypeKey | null;
}

export interface CkmArchetypeView extends Omit<CkmArchetypeElements, "elements"> {
  elements: CkmElementView[];
}

/** The current revision of an archetype with its elements, to pick one (EL4) or import (EL7). */
export async function listArchetypeElements(
  db: Kysely<DB>,
  ckm: CkmClient,
  userId: string,
  input: ArchetypeInput,
): Promise<CkmActionResult<CkmArchetypeView>> {
  const denied = await checkRole(db, userId, input.projectId, { ckm: ["search"] });
  if (denied) return refused(denied);
  const result = await ckm.archetypeElements(input.cid);
  if (result.kind !== "ok") return ckmRefused(result);
  const { elements, ...archetype } = result.value;
  return {
    ok: true,
    value: {
      ...archetype,
      elements: elements.map((element) => ({
        ...element,
        dataType: dataTypeForRmTypes(element.rmTypes),
      })),
    },
  };
}

/** Fetches the archetype and checks it is still at the revision the facilitator saw. */
async function currentArchetype(
  ckm: CkmClient,
  cid: string,
  revision: string,
): Promise<CkmActionResult<CkmArchetypeElements>> {
  const result = await ckm.archetypeElements(cid);
  if (result.kind !== "ok") return ckmRefused(result);
  if (result.value.revision !== revision) return refused("ckm_revision_changed");
  return { ok: true, value: result.value };
}

function linkRow(elementId: string, archetype: CkmArchetype, element: ArchetypeElement) {
  return {
    element_id: elementId,
    archetype_id: archetype.archetypeId,
    cid: archetype.cid,
    revision: archetype.revision,
    at_code: element.atCode,
    ckm_element_name: element.name,
    rm_type: linkRmType(element.rmTypes),
  };
}

export interface ElementLink {
  elementId: string;
  archetypeId: string;
  revision: string;
  atCode: string;
  rmType: string;
  dataType: DataTypeKey | null;
}

/**
 * Links a candidate element to an archetype element (EL4), replacing an earlier link. The
 * element takes the data type of the archetype element when it is in the list; otherwise its
 * data type is cleared and the RM type stays on the link (docs/architecture.md, "Element data
 * types").
 */
export async function linkElement(
  db: Kysely<DB>,
  ckm: CkmClient,
  userId: string,
  input: LinkElementInput,
): Promise<CkmActionResult<ElementLink>> {
  const permission = { ckm: ["link"] } as const;
  const denied = await checkRole(db, userId, input.projectId, permission);
  if (denied) return refused(denied);
  const fetched = await currentArchetype(ckm, input.cid, input.revision);
  if (!fetched.ok) return fetched;
  const archetype = fetched.value;
  const target = archetype.elements.find((element) => element.path === input.path);
  if (!target) return refused("ckm_element_not_found");
  const dataType = dataTypeForRmTypes(target.rmTypes);

  return withProject(db, userId, input.projectId, permission, async (trx, project) => {
    const element = await trx
      .selectFrom("element")
      .select("id")
      .where("id", "=", input.elementId)
      .where("project_id", "=", project.id)
      .where("merged_into", "is", null)
      .forUpdate()
      .executeTakeFirst();
    if (!element) return refused("element_not_found");
    const link = linkRow(element.id, archetype, target);
    await trx
      .insertInto("element_ckm_link")
      .values(link)
      .onConflict((conflict) =>
        conflict.column("element_id").doUpdateSet({ ...link, linked_at: new Date() }),
      )
      .execute();
    await trx
      .updateTable("element")
      .set({ data_type: dataType, updated_at: new Date() })
      .where("id", "=", element.id)
      .execute();
    await log(trx, userId, project.id, "element_ckm_linked", "element", element.id);
    return {
      ok: true,
      value: {
        elementId: element.id,
        archetypeId: archetype.archetypeId,
        revision: archetype.revision,
        atCode: target.atCode,
        rmType: link.rm_type,
        dataType,
      },
    };
  });
}

export interface ArchetypeImport {
  archetypeId: string;
  revision: string;
  elementIds: string[];
}

/**
 * Imports every element of an archetype as a candidate (EL7), in one transaction: the term text
 * and description in the archetype's original language, the data type and cardinality where
 * they fit the lists, a `ckm` source labelled with the archetype ID, and a link as in EL4. An
 * archetype already imported into the project is refused.
 */
export async function importArchetype(
  db: Kysely<DB>,
  ckm: CkmClient,
  userId: string,
  input: ImportArchetypeInput,
): Promise<CkmActionResult<ArchetypeImport>> {
  const permission = { ckm: ["import"] } as const;
  const denied = await checkRole(db, userId, input.projectId, permission);
  if (denied) return refused(denied);
  const fetched = await currentArchetype(ckm, input.cid, input.revision);
  if (!fetched.ok) return fetched;
  const archetype = fetched.value;
  if (archetype.elements.length === 0) return refused("ckm_no_elements");

  return withProject(db, userId, input.projectId, permission, async (trx, project) => {
    const earlier = await trx
      .selectFrom("element_source")
      .innerJoin("element", "element.id", "element_source.element_id")
      .select("element_source.id")
      .where("element.project_id", "=", project.id)
      .where("element_source.kind", "=", "ckm")
      .where("element_source.label", "=", archetype.archetypeId)
      .executeTakeFirst();
    if (earlier) return refused("ckm_already_imported");
    const member = await trx
      .selectFrom("member")
      .select("id")
      .where("organizationId", "=", project.id)
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow();
    const elementIds: string[] = [];
    for (const element of archetype.elements) {
      const occurs = cardinality(element);
      const row = await trx
        .insertInto("element")
        .values({
          project_id: project.id,
          name: element.name,
          description: element.description,
          data_type: dataTypeForRmTypes(element.rmTypes),
          min_occurs: occurs?.min ?? null,
          max_occurs: occurs?.max ?? null,
          author_member_id: member.id,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("element_source")
        .values({ element_id: row.id, kind: "ckm", label: archetype.archetypeId })
        .execute();
      await trx
        .insertInto("element_ckm_link")
        .values(linkRow(row.id, archetype, element))
        .execute();
      elementIds.push(row.id);
    }
    await log(trx, userId, project.id, "ckm_archetype_imported", "ckm_archetype", archetype.cid);
    return {
      ok: true,
      value: { archetypeId: archetype.archetypeId, revision: archetype.revision, elementIds },
    };
  });
}
