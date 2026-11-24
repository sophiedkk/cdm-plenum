// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The recap of a phase that is done (PR13, ADR 0020): read only, for every member. Scope: the
// model type, the statement and its sources; Discover: how many elements went into round 1 and from where, the
// merged duplicates and the groups; Decide: the rounds and their outcomes. Every count is of
// elements, people or rounds; no fact names a person (Q-ANON-1).
import type { Kysely } from "kysely";
import type { Outcome } from "@/lib/consensus";
import { isModelType, type ModelType } from "@/lib/model-types";
import { adjacentPhase, type ProjectPhase, phaseDone } from "@/lib/project-phases";
import type { DB } from "../db/schema.gen.ts";
import { type ModelStructure, modelStructures } from "../details/queries.ts";
import { type ElementGroup, groupingOf } from "../elements/groups.ts";
import { visibleAuthor } from "../elements/queries.ts";
import type { SourceModelKind } from "../sources/queries.ts";
import { done, type ProjectResult, readProject, refused } from "./access.ts";

type Db = Kysely<DB>;

export interface ScopeRecap {
  phase: "scope";
  closedAt: string | null;
  /** Null when the facilitator chose none (SC4). */
  modelType: ModelType | null;
  concept: string;
  useCases: string;
  outOfScope: string;
  sources: { label: string; url: string | null }[];
}

export interface DiscoverRecap {
  phase: "discover";
  closedAt: string | null;
  /** Elements in round 1, or on the list when no round has opened yet. */
  elements: number;
  /** Of those, the elements from existing models (EL7). */
  fromModels: number;
  /** Existing models with elements on the list. */
  models: { kind: SourceModelKind; title: string }[];
  /** Of those, the elements people added, and how many people added them. */
  added: number;
  contributors: number;
  /** Of those, the elements from a CSV file (EL3). */
  fromFiles: number;
  /** Elements merged into another as duplicates (EL5). */
  merged: number;
  groups: ElementGroup[];
  /** Round 1, for the link to its results; null before it closed. */
  firstRound: { id: string } | null;
}

export interface DecideRound {
  id: string;
  number: number;
  closedAt: string | null;
  elements: number;
  outcomes: Record<Outcome, number>;
}

export interface DecideRecap {
  phase: "decide";
  closedAt: string | null;
  rounds: DecideRound[];
}

export interface DetailRecap {
  phase: "detail";
  closedAt: string | null;
  /** The elements in the model with their structure (DT1, DT2). */
  elements: ModelStructure[];
}

export type PhaseRecap = ScopeRecap | DiscoverRecap | DecideRecap | DetailRecap;

/** When the project left `phase`: the newest move to the phase after it, or null. */
async function closedAt(db: Db, projectId: string, phase: ProjectPhase): Promise<string | null> {
  const next = adjacentPhase(phase, "next");
  if (next === null) return null;
  const row = await db
    .selectFrom("activity_log")
    .select("occurred_at")
    .where("project_id", "=", projectId)
    .where("action", "=", `phase_moved_to_${next}`)
    .orderBy("occurred_at", "desc")
    .executeTakeFirst();
  return row?.occurred_at.toISOString() ?? null;
}

async function scopeRecap(db: Db, projectId: string): Promise<ScopeRecap> {
  const project = await db
    .selectFrom("project")
    .select("model_type")
    .where("id", "=", projectId)
    .executeTakeFirst();
  const statement = await db
    .selectFrom("scope_statement")
    .select(["concept", "use_cases", "out_of_scope"])
    .where("project_id", "=", projectId)
    .executeTakeFirst();
  const sources = await db
    .selectFrom("scope_source")
    .select(["label", "url"])
    .where("project_id", "=", projectId)
    .orderBy("position")
    .execute();
  return {
    phase: "scope",
    closedAt: await closedAt(db, projectId, "scope"),
    modelType: isModelType(project?.model_type) ? project.model_type : null,
    concept: statement?.concept ?? "",
    useCases: statement?.use_cases ?? "",
    outOfScope: statement?.out_of_scope ?? "",
    sources,
  };
}

/**
 * The discover recap. `onlyAuthor` is the reader's member id while they may see only their own
 * elements (the private step, EL13); then the groups name only their own elements and those from
 * existing models, as the board would. The counts stay: they name nobody.
 */
async function discoverRecap(
  db: Db,
  projectId: string,
  onlyAuthor: string | null,
): Promise<DiscoverRecap> {
  const firstRound = await db
    .selectFrom("round")
    .select(["id", "closed_at"])
    .where("project_id", "=", projectId)
    .where("kind", "=", "elements")
    .where("number", "=", 1)
    .where("opened_at", "is not", null)
    .executeTakeFirst();
  let query = db
    .selectFrom("element")
    .leftJoin("member", "member.id", "element.author_member_id")
    .select((eb) => [
      "element.id",
      "element.author_member_id",
      "member.role",
      eb
        .exists(
          eb
            .selectFrom("element_source_link as link")
            .select("link.element_id")
            .whereRef("link.element_id", "=", "element.id"),
        )
        .as("from_model"),
      eb
        .exists(
          eb
            .selectFrom("element_source as source")
            .select("source.element_id")
            .whereRef("source.element_id", "=", "element.id")
            .where("source.kind", "=", "csv"),
        )
        .as("from_file"),
    ])
    .where("element.project_id", "=", projectId);
  query = firstRound
    ? query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("round_element")
            .select("round_element.element_id")
            .whereRef("round_element.element_id", "=", "element.id")
            .where("round_element.round_id", "=", firstRound.id),
        ),
      )
    : query.where("element.merged_into", "is", null);
  const rows = await query.execute();
  const fromModels = rows.filter((row) => row.from_model).length;
  const fromFiles = rows.filter((row) => !row.from_model && row.from_file).length;
  const added = rows.filter((row) => !row.from_model && !row.from_file);
  const contributors = new Set(
    added.flatMap((row) =>
      row.role === "participant" && row.author_member_id ? [row.author_member_id] : [],
    ),
  );
  const merged = await db
    .selectFrom("element")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("project_id", "=", projectId)
    .where("merged_into", "is not", null)
    .executeTakeFirstOrThrow();
  const models = await db
    .selectFrom("source_model")
    .select(["kind", "title"])
    .where("project_id", "=", projectId)
    .where("status", "=", "imported")
    .orderBy("created_at")
    .execute();
  const grouping = await groupingOf(db, projectId);
  const inRound = new Set(
    rows
      .filter((row) => onlyAuthor === null || row.from_model || row.author_member_id === onlyAuthor)
      .map((row) => row.id),
  );
  return {
    phase: "discover",
    closedAt: await closedAt(db, projectId, "discover"),
    elements: rows.length,
    fromModels,
    models: models.map((model) => ({ kind: model.kind as SourceModelKind, title: model.title })),
    added: added.length,
    contributors: contributors.size,
    fromFiles,
    merged: Number(merged.count),
    groups: grouping.groups
      .map((group) => ({
        ...group,
        elements: group.elements.filter((element) => inRound.has(element.id)),
      }))
      .filter((group) => group.elements.length > 0),
    firstRound: firstRound?.closed_at ? { id: firstRound.id } : null,
  };
}

async function decideRecap(db: Db, projectId: string): Promise<DecideRecap> {
  const rounds = await db
    .selectFrom("round")
    .select(["id", "number", "closed_at"])
    .where("project_id", "=", projectId)
    .where("kind", "=", "elements")
    .where("opened_at", "is not", null)
    .orderBy("number")
    .execute();
  const elements = await db
    .selectFrom("round_element")
    .innerJoin("round", "round.id", "round_element.round_id")
    .select(["round_element.round_id", "round_element.outcome"])
    .where("round.project_id", "=", projectId)
    .execute();
  return {
    phase: "decide",
    closedAt: await closedAt(db, projectId, "decide"),
    rounds: rounds.map((round) => {
      const own = elements.filter((row) => row.round_id === round.id);
      const outcomes: Record<Outcome, number> = { included: 0, excluded: 0, no_consensus: 0 };
      for (const row of own) {
        if (
          row.outcome === "included" ||
          row.outcome === "excluded" ||
          row.outcome === "no_consensus"
        )
          outcomes[row.outcome] += 1;
      }
      return {
        id: round.id,
        number: round.number,
        closedAt: round.closed_at?.toISOString() ?? null,
        elements: own.length,
        outcomes,
      };
    }),
  };
}

/**
 * The recap of a done phase for any member (`not_found` for anyone else). Refused with
 * `recap_not_ready` for the current phase and the phases after it.
 */
export async function phaseRecap(
  db: Db,
  userId: string,
  projectId: string,
  phase: ProjectPhase,
): Promise<ProjectResult<PhaseRecap>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    if (!phaseDone(project.phase, phase)) return refused("recap_not_ready");
    switch (phase) {
      case "scope":
        return done(await scopeRecap(reader, project.id));
      case "discover":
        return done(
          await discoverRecap(reader, project.id, await visibleAuthor(reader, project, userId)),
        );
      case "decide":
        return done(await decideRecap(reader, project.id));
      case "detail":
        return done({
          phase: "detail",
          closedAt: await closedAt(reader, project.id, "detail"),
          elements: await modelStructures(reader, project.id),
        });
      case "handoff":
        return refused("recap_not_ready");
    }
  });
}
