// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The checks every answer to a round shares, a rating (DE3) or a consent answer (DE20).
import type { Transaction } from "kysely";
import { ratingWriteOf, writeOpen } from "@/lib/phase-access";
import type { ProjectPhase } from "@/lib/project-phases";
import type { ProjectRole } from "@/lib/project-roles";
import type { DB } from "../db/schema.gen.ts";
import { ownGroupId } from "../projects/queries.ts";
import { done, type RoundResult, refused } from "./access.ts";
import { findRound, kindOf } from "./round.ts";
import type { RoundInput } from "./schemas.ts";

/** The item a rating is of: an element of an element round, or a value of a value round (DT3). */
export type RatedItem =
  | { kind: "elements"; elementId: string }
  | { kind: "values"; valueId: string };

const NOT_IN_ROUND = { elements: "element_not_in_round", values: "value_not_in_round" } as const;

/**
 * The checks every rating action shares: the round is opened and of the item's kind, the phase
 * takes ratings in it (PR10, DT3: `phase_closed`), the item is in the round, and a facilitator
 * rates only from their own stakeholder group (DE14, `rater_group_required`).
 */
export async function raterContext(
  trx: Transaction<DB>,
  userId: string,
  input: RoundInput,
  item: RatedItem,
  role: ProjectRole,
  phase: ProjectPhase,
): Promise<RoundResult<{ roundId: string; teamId: string | null }>> {
  const teamId = await ownGroupId(trx, input.projectId, userId);
  if (role === "facilitator" && teamId === null) return refused("rater_group_required");
  const round = await findRound(trx, input.projectId, input.roundId, "share");
  if (!round || round.opened_at === null) return refused("round_not_found");
  if (kindOf(round) !== item.kind) return refused(NOT_IN_ROUND[item.kind]);
  if (!writeOpen(role, phase, ratingWriteOf(item.kind))) return refused("phase_closed");
  const inRound =
    item.kind === "values"
      ? await trx
          .selectFrom("round_value")
          .select("id")
          .where("round_id", "=", round.id)
          .where("id", "=", item.valueId)
          .executeTakeFirst()
      : await trx
          .selectFrom("round_element")
          .select("element_id as id")
          .where("round_id", "=", round.id)
          .where("element_id", "=", item.elementId)
          .executeTakeFirst();
  if (!inRound) return refused(NOT_IN_ROUND[item.kind]);
  return done({ roundId: round.id, teamId });
}
