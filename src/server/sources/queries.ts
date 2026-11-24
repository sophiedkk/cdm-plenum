// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Source models (EL12, ADR 0016): the facilitator adds FHIR profiles and logical models, zibs,
// CKM archetypes and other sources, imports their elements as candidates (EL7, EL11) and
// compares them in a coverage table (EL20); a participant suggests a source with a title and a
// link. Registry and CKM calls happen before the transaction that writes (R-06), after a role
// check; the transaction checks the role and the phase again on the locked project.
import type { Kysely, Transaction } from "kysely";
import { cardinalityError } from "@/lib/cardinality";
import { DATA_TYPES, type DataTypeKey } from "@/lib/data-types";
import { preparesAhead, SOURCE_PHASE } from "@/lib/phase-access";
import { type ProjectPermission, projectCan } from "@/lib/project-roles";
import { type CoverageRow, matchSourceElements } from "@/lib/source-matching";
import { startingPrompt } from "@/lib/source-placement";
import type { CkmClient } from "../ckm/client.ts";
import { type CkmActionError, linkRmType } from "../ckm/queries.ts";
import type { DB } from "../db/schema.gen.ts";
import type { FhirClient } from "../fhir/client.ts";
import { type FhirActionError, fhirRefused } from "../fhir/queries.ts";
import {
  done,
  type LockedProject,
  lockProject,
  phaseOpenFor,
  readProject,
} from "../projects/access.ts";
import { type Author, actorMemberId } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import {
  type AddCkmSourceInput,
  type AddFhirSourceInput,
  type BaseModelInput,
  type OtherSourceInput,
  type ProjectInput,
  type PutOnListInput,
  SOURCE_TITLE_MAX,
  type SourceModelInput,
  type UnmatchRowInput,
} from "./schemas.ts";

/** Why a source model action was refused, beyond the project, CKM and FHIR codes. */
export const SOURCE_ACTION_ERRORS = [
  "source_not_found",
  "source_already_added",
  "source_already_imported",
  "source_not_added",
  "source_not_suggested",
  "source_no_elements",
  "source_after_discover",
  "source_row_not_found",
  "source_row_not_suggested",
  "source_row_on_list",
  "source_base_not_in_table",
] as const;
export type SourceActionError =
  | CkmActionError
  | FhirActionError
  | (typeof SOURCE_ACTION_ERRORS)[number];

/** The outcome of a source action; `status` is the remote HTTP status with `*_refused`. */
export type SourceActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SourceActionError; status?: number };

export const SOURCE_MODEL_KINDS = ["ckm", "fhir", "zib", "other"] as const;
export type SourceModelKind = (typeof SOURCE_MODEL_KINDS)[number];
export const SOURCE_MODEL_STATUSES = ["suggested", "added", "imported"] as const;
export type SourceModelStatus = (typeof SOURCE_MODEL_STATUSES)[number];

function refused<T>(error: SourceActionError): SourceActionResult<T> {
  return { ok: false, error };
}

/** One element of a source model as the app stores it (EL4, EL7). */
export interface SourceElementRow {
  path: string;
  atCode: string | null;
  name: string;
  definition: string;
  /** The FHIR type codes or the RM type, joined with ` | ` for a choice. */
  type: string | null;
  min: number | null;
  /** Null with a minimum is unbounded. */
  max: number | null;
  codeSystem: string | null;
  code: string | null;
  codeDisplay: string | null;
  bindingStrength: string | null;
  bindingValueSet: string | null;
  nlCmId: string | null;
}

/** A source model as every member sees it; `addedBy` is the facilitator's only (EL2). */
export interface SourceModel {
  id: string;
  kind: SourceModelKind;
  status: SourceModelStatus;
  title: string;
  link: string | null;
  fhir: { package: string; version: string; canonical: string; kind: string | null } | null;
  ckm: { archetypeId: string; cid: string; revision: string } | null;
  zib: { name: string; version: string | null } | null;
  elementCount: number;
  /** Whether the reader added or suggested it. */
  mine: boolean;
  createdAt: Date;
  importedAt: Date | null;
}

export interface SourceModelWithAuthor extends SourceModel {
  /** Null when the member left the project or the model came from a copied CKM link. */
  addedBy: Author | null;
}

/** Refuses a non-member (`not_found`), a missing permission (`forbidden`) or a late phase. */
async function precheck(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  permission: ProjectPermission,
): Promise<SourceActionError | null> {
  const read = await readProject(db, userId, projectId, permission, async (_db, project) =>
    done(project),
  );
  if (!read.ok) return read.error;
  return preparesAhead(read.value.phase, SOURCE_PHASE) ? null : "source_after_discover";
}

/**
 * Runs `action` in one transaction on the locked project after the role check and, for the
 * facilitator's preparation (PR10), the phase check: refused once discover is over.
 */
async function inProject<T>(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  permission: ProjectPermission,
  action: (trx: Transaction<DB>, project: LockedProject) => Promise<SourceActionResult<T>>,
): Promise<SourceActionResult<T>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, projectId, userId);
    if (!project) return refused<T>("not_found");
    if (!projectCan(project.role, permission)) return refused<T>("forbidden");
    if (!preparesAhead(project.phase, SOURCE_PHASE)) return refused<T>("source_after_discover");
    return action(trx, project);
  });
}

type NewModel = Omit<
  DB["source_model"],
  "id" | "project_id" | "created_at" | "imported_at" | "added_by_member_id" | "is_base"
> & { kind: SourceModelKind; status: SourceModelStatus };

/** Inserts a model and its elements, in the order given. */
async function insertModel(
  trx: Transaction<DB>,
  project: LockedProject,
  userId: string,
  model: NewModel,
  elements: readonly SourceElementRow[],
): Promise<string> {
  const row = await trx
    .insertInto("source_model")
    .values({
      ...model,
      project_id: project.id,
      added_by_member_id: await actorMemberId(trx, project.id, userId),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  if (elements.length > 0) {
    await trx
      .insertInto("source_element")
      .values(
        elements.map((element, position) => ({
          source_model_id: row.id,
          position,
          path: element.path,
          at_code: element.atCode,
          name: element.name,
          definition: element.definition,
          type: element.type,
          min_occurs: element.min,
          max_occurs: element.min === null ? null : element.max,
          code_system: element.codeSystem,
          code: element.code,
          code_display: element.codeDisplay,
          binding_strength: element.bindingStrength,
          binding_value_set: element.bindingValueSet,
          nl_cm_id: element.nlCmId,
        })),
      )
      .execute();
  }
  await log(trx, userId, project.id, "source_model_added", "source_model", row.id);
  return row.id;
}

export interface AddedSourceModel {
  sourceModelId: string;
  kind: SourceModelKind;
  elementCount: number;
}

/**
 * Adds a FHIR profile or logical model of a package version (EL10, EL12): a `zib` model when
 * the StructureDefinition maps to a zib, else `fhir`, with every element the parser keeps.
 */
export async function addFhirSource(
  db: Kysely<DB>,
  fhir: FhirClient,
  userId: string,
  input: AddFhirSourceInput,
): Promise<SourceActionResult<AddedSourceModel>> {
  const permission = { source: ["add"] } as const;
  const denied = await precheck(db, userId, input.projectId, permission);
  if (denied) return refused(denied);
  const result = await fhir.structureDefinition(input.packageName, input.version, input.url);
  if (result.kind !== "ok") return fhirRefused(result);
  const structure = result.value;
  if (structure.elements.length === 0) return refused("source_no_elements");
  const elements: SourceElementRow[] = structure.elements.map((element) => ({
    path: element.id,
    atCode: null,
    name: element.name,
    definition: element.definition,
    type: element.types.length === 0 ? null : element.types.join(" | "),
    min: element.min,
    max: element.max,
    codeSystem: element.codes[0]?.system ?? null,
    code: element.codes[0]?.code ?? null,
    codeDisplay: element.codes[0]?.display ?? null,
    bindingStrength: element.binding?.strength ?? null,
    bindingValueSet: element.binding?.valueSet ?? null,
    nlCmId: element.nlCmId,
  }));
  const kind = structure.zib ? "zib" : "fhir";

  return inProject(db, userId, input.projectId, permission, async (trx, project) => {
    const earlier = await trx
      .selectFrom("source_model")
      .select("id")
      .where("project_id", "=", project.id)
      .where("kind", "in", ["fhir", "zib"])
      .where("fhir_package", "=", input.packageName)
      .where("fhir_version", "=", input.version)
      .where("fhir_canonical", "=", structure.url)
      .executeTakeFirst();
    if (earlier) return refused("source_already_added");
    const sourceModelId = await insertModel(
      trx,
      project,
      userId,
      {
        kind,
        status: "added",
        title: (structure.title ?? structure.name).slice(0, SOURCE_TITLE_MAX),
        link: null,
        fhir_package: input.packageName,
        fhir_version: input.version,
        fhir_canonical: structure.url,
        fhir_kind: structure.kind,
        fhir_type: structure.type,
        ckm_archetype_id: null,
        ckm_cid: null,
        ckm_revision: null,
        zib_name: structure.zib?.name ?? null,
        zib_version: structure.zib?.version ?? null,
      },
      elements,
    );
    return { ok: true, value: { sourceModelId, kind, elementCount: elements.length } };
  });
}

/** Adds the current revision of a CKM archetype with its ELEMENT nodes (EL4, EL12). */
export async function addCkmSource(
  db: Kysely<DB>,
  ckm: CkmClient,
  userId: string,
  input: AddCkmSourceInput,
): Promise<SourceActionResult<AddedSourceModel>> {
  const permission = { source: ["add"] } as const;
  const denied = await precheck(db, userId, input.projectId, permission);
  if (denied) return refused(denied);
  const result = await ckm.archetypeElements(input.cid);
  if (result.kind !== "ok") {
    if (result.kind === "refused")
      return { ok: false, error: "ckm_refused", status: result.status };
    return refused(`ckm_${result.kind}`);
  }
  const archetype = result.value;
  if (archetype.elements.length === 0) return refused("source_no_elements");
  const elements: SourceElementRow[] = archetype.elements.map((element) => ({
    path: element.path,
    atCode: element.atCode,
    name: element.name,
    definition: element.description,
    type: linkRmType(element.rmTypes),
    min: element.occurrences?.min ?? null,
    max: element.occurrences?.max ?? null,
    codeSystem: null,
    code: null,
    codeDisplay: null,
    bindingStrength: null,
    bindingValueSet: null,
    nlCmId: null,
  }));

  return inProject(db, userId, input.projectId, permission, async (trx, project) => {
    const earlier = await trx
      .selectFrom("source_model")
      .select("id")
      .where("project_id", "=", project.id)
      .where("kind", "=", "ckm")
      .where("ckm_archetype_id", "=", archetype.archetypeId)
      .executeTakeFirst();
    if (earlier) return refused("source_already_added");
    const sourceModelId = await insertModel(
      trx,
      project,
      userId,
      {
        kind: "ckm",
        status: "added",
        title: (archetype.name || archetype.archetypeId).slice(0, SOURCE_TITLE_MAX),
        link: null,
        fhir_package: null,
        fhir_version: null,
        fhir_canonical: null,
        fhir_kind: null,
        fhir_type: null,
        ckm_archetype_id: archetype.archetypeId,
        ckm_cid: archetype.cid,
        ckm_revision: archetype.revision,
        zib_name: null,
        zib_version: null,
      },
      elements,
    );
    return { ok: true, value: { sourceModelId, kind: "ckm", elementCount: elements.length } };
  });
}

function otherModel(input: OtherSourceInput, status: SourceModelStatus): NewModel {
  return {
    kind: "other",
    status,
    title: input.title,
    link: input.link,
    fhir_package: null,
    fhir_version: null,
    fhir_canonical: null,
    fhir_kind: null,
    fhir_type: null,
    ckm_archetype_id: null,
    ckm_cid: null,
    ckm_revision: null,
    zib_name: null,
    zib_version: null,
  };
}

/** Adds a form, local data set or guideline by title and link (EL12); it has no elements. */
export async function addOtherSource(
  db: Kysely<DB>,
  userId: string,
  input: OtherSourceInput,
): Promise<SourceActionResult<AddedSourceModel>> {
  return inProject(db, userId, input.projectId, { source: ["add"] }, async (trx, project) => {
    const sourceModelId = await insertModel(trx, project, userId, otherModel(input, "added"), []);
    return { ok: true, value: { sourceModelId, kind: "other", elementCount: 0 } };
  });
}

/**
 * A member suggests a source model by title and link (EL12), while the phase table opens
 * `source_suggest`; the facilitator accepts or dismisses it.
 */
export async function suggestSource(
  db: Kysely<DB>,
  userId: string,
  input: OtherSourceInput,
): Promise<SourceActionResult<{ sourceModelId: string }>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    if (!(await phaseOpenFor(trx, project, "source_suggest"))) return refused("phase_closed");
    const sourceModelId = await insertModel(
      trx,
      project,
      userId,
      otherModel(input, "suggested"),
      [],
    );
    return { ok: true, value: { sourceModelId } };
  });
}

/** The project's suggestion `id`, locked, or a refusal. */
async function suggestion(
  trx: Transaction<DB>,
  projectId: string,
  id: string,
): Promise<SourceActionError | null> {
  const row = await trx
    .selectFrom("source_model")
    .select("status")
    .where("id", "=", id)
    .where("project_id", "=", projectId)
    .forUpdate()
    .executeTakeFirst();
  if (!row) return "source_not_found";
  return row.status === "suggested" ? null : "source_not_suggested";
}

/** Accepts a suggestion: it stays as an `other` source with its title and link. */
export async function acceptSuggestion(
  db: Kysely<DB>,
  userId: string,
  input: SourceModelInput,
): Promise<SourceActionResult<null>> {
  return inProject(db, userId, input.projectId, { source: ["review"] }, async (trx, project) => {
    const problem = await suggestion(trx, project.id, input.sourceModelId);
    if (problem) return refused(problem);
    await trx
      .updateTable("source_model")
      .set({ status: "added" })
      .where("id", "=", input.sourceModelId)
      .execute();
    await log(
      trx,
      userId,
      project.id,
      "source_suggestion_accepted",
      "source_model",
      input.sourceModelId,
    );
    return { ok: true, value: null };
  });
}

/** Dismisses a suggestion: it is deleted; the activity log keeps the decision. */
export async function dismissSuggestion(
  db: Kysely<DB>,
  userId: string,
  input: SourceModelInput,
): Promise<SourceActionResult<null>> {
  return inProject(db, userId, input.projectId, { source: ["review"] }, async (trx, project) => {
    const problem = await suggestion(trx, project.id, input.sourceModelId);
    if (problem) return refused(problem);
    await trx.deleteFrom("source_model").where("id", "=", input.sourceModelId).execute();
    await log(
      trx,
      userId,
      project.id,
      "source_suggestion_dismissed",
      "source_model",
      input.sourceModelId,
    );
    return { ok: true, value: null };
  });
}

type ModelRow = Pick<
  DB["source_model"],
  | "kind"
  | "status"
  | "title"
  | "link"
  | "fhir_package"
  | "fhir_version"
  | "fhir_canonical"
  | "fhir_kind"
  | "ckm_archetype_id"
  | "ckm_cid"
  | "ckm_revision"
  | "zib_name"
  | "zib_version"
  | "added_by_member_id"
> & { id: string; created_at: Date; imported_at: Date | null; element_count: string | number };

function toSourceModel(row: ModelRow, readerMemberId: string): SourceModel {
  return {
    id: row.id,
    kind: row.kind as SourceModelKind,
    status: row.status as SourceModelStatus,
    title: row.title,
    link: row.link,
    fhir:
      row.fhir_package !== null && row.fhir_version !== null && row.fhir_canonical !== null
        ? {
            package: row.fhir_package,
            version: row.fhir_version,
            canonical: row.fhir_canonical,
            kind: row.fhir_kind,
          }
        : null,
    ckm:
      row.ckm_archetype_id !== null && row.ckm_cid !== null && row.ckm_revision !== null
        ? { archetypeId: row.ckm_archetype_id, cid: row.ckm_cid, revision: row.ckm_revision }
        : null,
    zib: row.zib_name !== null ? { name: row.zib_name, version: row.zib_version } : null,
    elementCount: Number(row.element_count),
    mine: row.added_by_member_id === readerMemberId,
    createdAt: row.created_at,
    importedAt: row.imported_at,
  };
}

async function modelRows(db: Kysely<DB>, projectId: string): Promise<ModelRow[]> {
  return db
    .selectFrom("source_model")
    .leftJoin("source_element", "source_element.source_model_id", "source_model.id")
    .select((eb) => [
      "source_model.id",
      "source_model.kind",
      "source_model.status",
      "source_model.title",
      "source_model.link",
      "source_model.fhir_package",
      "source_model.fhir_version",
      "source_model.fhir_canonical",
      "source_model.fhir_kind",
      "source_model.ckm_archetype_id",
      "source_model.ckm_cid",
      "source_model.ckm_revision",
      "source_model.zib_name",
      "source_model.zib_version",
      "source_model.added_by_member_id",
      "source_model.created_at",
      "source_model.imported_at",
      eb.fn.count<string>("source_element.id").as("element_count"),
    ])
    .where("source_model.project_id", "=", projectId)
    .groupBy("source_model.id")
    .orderBy("source_model.created_at")
    .orderBy("source_model.id")
    .execute();
}

/**
 * The project's source models, suggestions included, oldest first, for any member (EL12).
 * Who added or suggested one stays out (EL2, ADR 0005); `mine` marks the reader's own.
 */
export async function listSourceModels(
  db: Kysely<DB>,
  userId: string,
  input: ProjectInput,
): Promise<SourceActionResult<SourceModel[]>> {
  return readProject(db, userId, input.projectId, null, async (db, project) => {
    const me = await actorMemberId(db, project.id, userId);
    return done((await modelRows(db, project.id)).map((row) => toSourceModel(row, me)));
  });
}

/** The source models with who added or suggested each (facilitator only, EL2). */
export async function listSourceModelsWithAuthors(
  db: Kysely<DB>,
  userId: string,
  input: ProjectInput,
): Promise<SourceActionResult<SourceModelWithAuthor[]>> {
  return readProject(
    db,
    userId,
    input.projectId,
    { source: ["read_authors"] },
    async (db, project) => {
      const me = await actorMemberId(db, project.id, userId);
      const rows = await modelRows(db, project.id);
      const memberIds = [
        ...new Set(rows.flatMap((row) => (row.added_by_member_id ? [row.added_by_member_id] : []))),
      ];
      const authors =
        memberIds.length === 0
          ? []
          : await db
              .selectFrom("member")
              .innerJoin("user", "user.id", "member.userId")
              .select(["member.id", "user.name", "user.email"])
              .where("member.id", "in", memberIds)
              .execute();
      const byId = new Map(
        authors.map((row) => [row.id, { memberId: row.id, name: row.name, email: row.email }]),
      );
      return done(
        rows.map((row) => ({
          ...toSourceModel(row, me),
          addedBy:
            row.added_by_member_id === null ? null : (byId.get(row.added_by_member_id) ?? null),
        })),
      );
    },
  );
}

/** A stored source element with its ids, as the import and the coverage table read it. */
export interface StoredSourceElement extends SourceElementRow {
  id: string;
  sourceModelId: string;
  /** The facilitator said "Not the same" to its suggested match (EL20). */
  unmatched: boolean;
}

async function storedElements(
  db: Kysely<DB>,
  modelIds: readonly string[],
): Promise<StoredSourceElement[]> {
  if (modelIds.length === 0) return [];
  const rows = await db
    .selectFrom("source_element")
    .selectAll()
    .where("source_model_id", "in", modelIds)
    .orderBy("source_model_id")
    .orderBy("position")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    sourceModelId: row.source_model_id,
    path: row.path,
    atCode: row.at_code,
    name: row.name,
    definition: row.definition,
    type: row.type,
    min: row.min_occurs,
    max: row.max_occurs,
    codeSystem: row.code_system,
    code: row.code,
    codeDisplay: row.code_display,
    bindingStrength: row.binding_strength,
    bindingValueSet: row.binding_value_set,
    nlCmId: row.nl_cm_id,
    unmatched: row.unmatched,
  }));
}

/** The models of `modelIds` in that order, each with its elements, for the matching. */
function byModel(modelIds: readonly string[], elements: readonly StoredSourceElement[]) {
  return modelIds.map((id) => ({
    id,
    elements: elements.filter((element) => element.sourceModelId === id),
  }));
}

/**
 * The data type key of a source element with one type (ADR 0009): by RM type for CKM, by FHIR
 * type otherwise, the first in the list when several keys share a FHIR type (CodeableConcept is
 * coded text). Null for a choice or a type outside the list.
 */
export function dataTypeForSource(kind: SourceModelKind, type: string | null): DataTypeKey | null {
  if (type === null || type.includes(" | ")) return null;
  const found = DATA_TYPES.find((dataType) =>
    kind === "ckm" ? dataType.rmType === type : dataType.fhirType === type,
  );
  return found?.key ?? null;
}

export interface SourceImport {
  /** The new candidate elements, in the source's order. */
  createdElementIds: string[];
  /** Elements already on the board that a code match linked this source to (EL20). */
  linkedElementIds: string[];
}

/**
 * Imports the elements of an added source model as candidates (EL7, EL11), in one transaction.
 * Each source element becomes a candidate with its name, definition, data type and cardinality
 * where they fit the lists, a source of the model's kind labelled with the archetype id or the
 * title, and a link to the source element (EL4); a CKM element also gets its CKM link. A source
 * element whose element code matches an element of an earlier imported model (the applied match
 * of EL20) is linked to that model's candidate instead of becoming a second one.
 */
export async function importSourceModel(
  db: Kysely<DB>,
  userId: string,
  input: SourceModelInput,
): Promise<SourceActionResult<SourceImport>> {
  return inProject(db, userId, input.projectId, { source: ["import"] }, async (trx, project) => {
    const model = await trx
      .selectFrom("source_model")
      .selectAll()
      .where("id", "=", input.sourceModelId)
      .where("project_id", "=", project.id)
      .forUpdate()
      .executeTakeFirst();
    if (!model) return refused("source_not_found");
    if (model.status === "suggested") return refused("source_not_added");
    if (model.status === "imported") return refused("source_already_imported");
    const kind = model.kind as SourceModelKind;
    if (kind === "other") return refused("source_no_elements");
    const label = kind === "ckm" ? (model.ckm_archetype_id ?? model.title) : model.title;
    if (kind === "ckm") {
      // An archetype imported through the CKM import of EL7 before the source models existed.
      const earlier = await trx
        .selectFrom("element_source")
        .innerJoin("element", "element.id", "element_source.element_id")
        .select("element_source.id")
        .where("element.project_id", "=", project.id)
        .where("element_source.kind", "=", "ckm")
        .where("element_source.label", "=", label)
        .executeTakeFirst();
      if (earlier) return refused("source_already_imported");
    }

    const imported = await trx
      .selectFrom("source_model")
      .select("id")
      .where("project_id", "=", project.id)
      .where("status", "=", "imported")
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    const modelIds = [...imported.map((row) => row.id), model.id];
    const elements = await storedElements(trx, modelIds);
    const own = elements.filter((element) => element.sourceModelId === model.id);
    if (own.length === 0) return refused("source_no_elements");

    // The candidate each earlier source element is linked to, when it is still on the board.
    const linked = await trx
      .selectFrom("element_source_link")
      .innerJoin("element", "element.id", "element_source_link.element_id")
      .select(["element_source_link.source_element_id", "element.id"])
      .where(
        "element_source_link.source_element_id",
        "in",
        elements.map((element) => element.id),
      )
      .where("element.merged_into", "is", null)
      .orderBy("element.created_at")
      .execute();
    const candidateOf = new Map<string, string>();
    for (const row of linked) {
      if (!candidateOf.has(row.source_element_id)) candidateOf.set(row.source_element_id, row.id);
    }
    const existing = new Map<string, string>();
    for (const row of matchSourceElements(byModel(modelIds, elements))) {
      if (!row.applied) continue;
      const others = Object.entries(row.cells)
        .filter(([modelId]) => modelId !== model.id)
        .flatMap(([, cell]) => cell);
      const candidate = others.map((element) => candidateOf.get(element.id)).find(Boolean);
      if (candidate === undefined) continue;
      for (const element of row.cells[model.id] ?? []) existing.set(element.id, candidate);
    }

    const authorMemberId = await actorMemberId(trx, project.id, userId);
    const createdElementIds: string[] = [];
    const linkedElementIds: string[] = [];
    for (const element of own) {
      let elementId = existing.get(element.id);
      if (elementId === undefined) {
        const occurs =
          element.min !== null && cardinalityError(element.min, element.max) === null
            ? { min: element.min, max: element.max }
            : null;
        const row = await trx
          .insertInto("element")
          .values({
            project_id: project.id,
            name: element.name,
            description: element.definition,
            data_type: dataTypeForSource(kind, element.type),
            min_occurs: occurs?.min ?? null,
            max_occurs: occurs?.max ?? null,
            prompt: startingPrompt(kind, element.path),
            author_member_id: authorMemberId,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        elementId = row.id;
        createdElementIds.push(elementId);
        if (kind === "ckm" && element.atCode !== null && model.ckm_cid && model.ckm_revision) {
          await trx
            .insertInto("element_ckm_link")
            .values({
              element_id: elementId,
              archetype_id: label,
              cid: model.ckm_cid,
              revision: model.ckm_revision,
              at_code: element.atCode,
              ckm_element_name: element.name,
              rm_type: element.type ?? "DATA_VALUE",
            })
            .execute();
        }
      } else if (!linkedElementIds.includes(elementId)) {
        linkedElementIds.push(elementId);
      }
      const hasSource = await trx
        .selectFrom("element_source")
        .select("id")
        .where("element_id", "=", elementId)
        .where("kind", "=", kind)
        .where("label", "=", label)
        .executeTakeFirst();
      if (!hasSource) {
        await trx
          .insertInto("element_source")
          .values({ element_id: elementId, kind, label })
          .execute();
      }
      await trx
        .insertInto("element_source_link")
        .values({ element_id: elementId, source_element_id: element.id })
        .execute();
    }
    await trx
      .updateTable("source_model")
      .set({ status: "imported", imported_at: new Date() })
      .where("id", "=", model.id)
      .execute();
    await log(trx, userId, project.id, "source_model_imported", "source_model", model.id);
    return { ok: true, value: { createdElementIds, linkedElementIds } };
  });
}

/** One column of the coverage table. */
export interface CoverageModel {
  id: string;
  kind: SourceModelKind;
  status: SourceModelStatus;
  title: string;
  /** The base model the others are compared with (EL25); its column comes first. */
  base: boolean;
}

/** A row of the coverage table with its id and whether its element is on the list already. */
export interface CoverageRowView extends CoverageRow<StoredSourceElement> {
  /** The id of the row's first source element; "Put on the list" names a row by it. */
  id: string;
  /** Whether a candidate element is linked to any source element of the row (EL7, EL20). */
  onList: boolean;
}

export interface Coverage {
  models: CoverageModel[];
  /** One row per candidate element; each cell holds that model's elements (EL20). */
  rows: CoverageRowView[];
}

interface CoverageModelRow {
  id: string;
  kind: string;
  status: string;
  title: string;
  is_base: boolean;
}

/**
 * The added and imported models with elements, the base model first and the others in the order
 * added, matched into rows. The base model's elements then lead each row and name it, so a
 * candidate put on the list derives from the base (EL25, zib 2.0 P4.3).
 */
async function coverageOf(
  db: Kysely<DB>,
  projectId: string,
): Promise<{ models: CoverageModelRow[]; rows: CoverageRowView[] }> {
  const models = await db
    .selectFrom("source_model")
    .select(["id", "kind", "status", "title", "is_base"])
    .where("project_id", "=", projectId)
    .where("status", "in", ["added", "imported"])
    .where("kind", "<>", "other")
    .orderBy("is_base", "desc")
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const modelIds = models.map((model) => model.id);
  const elements = await storedElements(db, modelIds);
  const links =
    elements.length === 0
      ? []
      : await db
          .selectFrom("element_source_link")
          .select("source_element_id")
          .where(
            "source_element_id",
            "in",
            elements.map((element) => element.id),
          )
          .execute();
  const linked = new Set(links.map((row) => row.source_element_id));
  const rows = matchSourceElements(byModel(modelIds, elements)).map((row) => {
    const all = Object.values(row.cells).flat();
    return {
      ...row,
      id: all[0]?.id ?? "",
      onList: all.some((element) => linked.has(element.id)),
    };
  });
  return { models, rows };
}

/**
 * The coverage table of the project's added and imported models with elements (EL20), for the
 * facilitator, in any phase: rows from `matchSourceElements`, models in the order added.
 */
export async function sourceCoverage(
  db: Kysely<DB>,
  userId: string,
  input: ProjectInput,
): Promise<SourceActionResult<Coverage>> {
  return readProject(db, userId, input.projectId, { source: ["review"] }, async (db, project) => {
    const { models, rows } = await coverageOf(db, project.id);
    return done({
      models: models.map((model) => ({
        id: model.id,
        kind: model.kind as SourceModelKind,
        status: model.status as SourceModelStatus,
        title: model.title,
        base: model.is_base,
      })),
      rows,
    });
  });
}

/**
 * Marks a model of the coverage table as the base model, or unmarks it (facilitator only, EL25,
 * ADR 0021). Marking a model unmarks the earlier base in the same transaction, so a project has
 * at most one. Refused with `source_not_found` for a model of another project and with
 * `source_base_not_in_table` for a suggestion or an other source, which have no column.
 */
export async function setBaseModel(
  db: Kysely<DB>,
  userId: string,
  input: BaseModelInput,
): Promise<SourceActionResult<null>> {
  return inProject(db, userId, input.projectId, { source: ["review"] }, async (trx, project) => {
    const model = await trx
      .selectFrom("source_model")
      .select(["id", "kind", "status", "is_base"])
      .where("id", "=", input.sourceModelId)
      .where("project_id", "=", project.id)
      .forUpdate()
      .executeTakeFirst();
    if (!model) return refused("source_not_found");
    if (model.status === "suggested" || model.kind === "other") {
      return refused("source_base_not_in_table");
    }
    if (model.is_base === input.base) return { ok: true, value: null };
    if (input.base) {
      await trx
        .updateTable("source_model")
        .set({ is_base: false })
        .where("project_id", "=", project.id)
        .where("is_base", "=", true)
        .execute();
    }
    await trx
      .updateTable("source_model")
      .set({ is_base: input.base })
      .where("id", "=", model.id)
      .execute();
    await log(
      trx,
      userId,
      project.id,
      input.base ? "source_base_set" : "source_base_cleared",
      "source_model",
      model.id,
    );
    return { ok: true, value: null };
  });
}

/** The label of an element source from a model: the archetype id for CKM, else the title. */
function sourceLabel(model: { kind: string; title: string; ckm_archetype_id: string | null }) {
  return model.kind === "ckm" ? (model.ckm_archetype_id ?? model.title) : model.title;
}

/**
 * Puts the chosen rows of the coverage table on the list (EL7, EL20, ADR 0020), in one
 * transaction: each row becomes one candidate element named after its first source element,
 * linked to every source element of the row, with a source per model and, for an openEHR
 * element, its CKM link. It starts under the question of its place in the first model (EL18).
 * A row already on the list is left as it is; every model that gets an element is imported.
 * Refused with `source_row_not_found` when an id names no row of the table.
 */
export async function putOnList(
  db: Kysely<DB>,
  userId: string,
  input: PutOnListInput,
): Promise<SourceActionResult<{ createdElementIds: string[] }>> {
  return inProject(db, userId, input.projectId, { source: ["import"] }, async (trx, project) => {
    const { rows } = await coverageOf(trx, project.id);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const chosen: CoverageRowView[] = [];
    for (const id of input.rowIds) {
      const row = byId.get(id);
      if (!row) return refused("source_row_not_found");
      if (!row.onList && !chosen.includes(row)) chosen.push(row);
    }
    const modelIds = [...new Set(chosen.flatMap((row) => Object.keys(row.cells)))];
    const models =
      modelIds.length === 0
        ? []
        : await trx
            .selectFrom("source_model")
            .select([
              "id",
              "kind",
              "status",
              "title",
              "ckm_archetype_id",
              "ckm_cid",
              "ckm_revision",
            ])
            .where("id", "in", modelIds)
            .orderBy("created_at")
            .orderBy("id")
            .forUpdate()
            .execute();
    const modelOf = new Map(models.map((model) => [model.id, model]));
    const authorMemberId = await actorMemberId(trx, project.id, userId);
    const createdElementIds: string[] = [];
    for (const row of chosen) {
      const cells = Object.entries(row.cells);
      const [firstModelId, firstCell] = cells[0] ?? [];
      const first = firstCell?.[0];
      const firstModel = firstModelId === undefined ? undefined : modelOf.get(firstModelId);
      if (!first || !firstModel) continue;
      const kind = firstModel.kind as SourceModelKind;
      const occurs =
        first.min !== null && cardinalityError(first.min, first.max) === null
          ? { min: first.min, max: first.max }
          : null;
      const created = await trx
        .insertInto("element")
        .values({
          project_id: project.id,
          name: first.name,
          description: first.definition,
          data_type: dataTypeForSource(kind, first.type),
          min_occurs: occurs?.min ?? null,
          max_occurs: occurs?.max ?? null,
          prompt: startingPrompt(kind, first.path),
          author_member_id: authorMemberId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      createdElementIds.push(created.id);
      let ckmLinked = false;
      for (const [modelId, cell] of cells) {
        const model = modelOf.get(modelId);
        if (!model) continue;
        await trx
          .insertInto("element_source")
          .values({
            element_id: created.id,
            kind: model.kind as SourceModelKind,
            label: sourceLabel(model),
          })
          .execute();
        for (const element of cell) {
          await trx
            .insertInto("element_source_link")
            .values({ element_id: created.id, source_element_id: element.id })
            .execute();
          if (
            ckmLinked ||
            model.kind !== "ckm" ||
            element.atCode === null ||
            !model.ckm_archetype_id ||
            !model.ckm_cid ||
            !model.ckm_revision
          ) {
            continue;
          }
          ckmLinked = true;
          await trx
            .insertInto("element_ckm_link")
            .values({
              element_id: created.id,
              archetype_id: model.ckm_archetype_id,
              cid: model.ckm_cid,
              revision: model.ckm_revision,
              at_code: element.atCode,
              ckm_element_name: element.name,
              rm_type: element.type ?? "DATA_VALUE",
            })
            .execute();
        }
      }
      await log(trx, userId, project.id, "element_imported", "element", created.id);
    }
    const now = new Date();
    for (const model of models) {
      if (model.status !== "added") continue;
      await trx
        .updateTable("source_model")
        .set({ status: "imported", imported_at: now })
        .where("id", "=", model.id)
        .execute();
      await log(trx, userId, project.id, "source_model_imported", "source_model", model.id);
    }
    return { ok: true, value: { createdElementIds } };
  });
}

/**
 * "Not the same" (EL20): splits a row matched by mapping or by name into one row per source
 * element, and keeps those elements out of every later suggested match. Only a suggestion can be
 * rejected: a code match or a lone element is refused (`source_row_not_suggested`), and so is a
 * row already on the list (`source_row_on_list`).
 */
export async function unmatchRow(
  db: Kysely<DB>,
  userId: string,
  input: UnmatchRowInput,
): Promise<SourceActionResult<null>> {
  return inProject(db, userId, input.projectId, { source: ["import"] }, async (trx, project) => {
    const { rows } = await coverageOf(trx, project.id);
    const row = rows.find((candidate) => candidate.id === input.rowId);
    if (!row) return refused("source_row_not_found");
    if (row.applied || row.basis === "none") return refused("source_row_not_suggested");
    if (row.onList) return refused("source_row_on_list");
    await trx
      .updateTable("source_element")
      .set({ unmatched: true })
      .where(
        "id",
        "in",
        Object.values(row.cells)
          .flat()
          .map((element) => element.id),
      )
      .execute();
    await log(trx, userId, project.id, "source_match_rejected", "source_element", row.id);
    return { ok: true, value: null };
  });
}
