// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The terminology step of the detail phase (DT4, DT5, ADR 0017). Once the structure of an element
// is settled, a terminologist or the facilitator proposes its codes; a second terminologist
// approves or returns the proposal before the group answers it (owner decision 2026-11-23). With
// no other terminologist, the facilitator skips the review with a reason. The answers, objections
// and settling are those of queries.ts.
import type { Kysely } from "kysely";
import { DETAIL_PHASE, preparesAhead } from "@/lib/phase-access";
import type { DB } from "../db/schema.gen.ts";
import {
  done,
  lockProject,
  type ProjectResult,
  phaseOpenFor,
  refused,
} from "../projects/access.ts";
import { actorMemberId } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import { inExpertGroup, modelElements, terminologists } from "./queries.ts";
import type { ProposeCodesInput, ReviewCodesInput, SkipReviewInput } from "./schemas.ts";

type Db = Kysely<DB>;

/**
 * Proposes or revises the codes of an element in the model (DT4, DT5). The facilitator proposes
 * up to and in the detail phase (PR10); a participant only in the detail phase (`phase_closed`)
 * and only from a terminology group (`detail_not_terminologist`). Refused with
 * `detail_structure_open` until the element's structure is settled, and with
 * `detail_value_codes_mismatch` unless there is one entry per value of its list. Every version
 * waits for a review again, and every member answers it again.
 */
export async function proposeCodes(
  db: Db,
  userId: string,
  input: ProposeCodesInput,
): Promise<ProjectResult<{ proposalId: string; version: number }>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    if (project.role === "facilitator") {
      if (!preparesAhead(project.phase, DETAIL_PHASE)) return refused("phase_closed");
    } else {
      if (!(await phaseOpenFor(trx, project, "detail_propose"))) return refused("phase_closed");
      if (!(await inExpertGroup(trx, project.id, userId, "terminology"))) {
        return refused("detail_not_terminologist");
      }
    }
    const element = (await modelElements(trx, project.id)).find(
      (row) => row.id === input.elementId,
    );
    if (!element) {
      const exists = await trx
        .selectFrom("element")
        .select("id")
        .where("id", "=", input.elementId)
        .where("project_id", "=", project.id)
        .where("merged_into", "is", null)
        .executeTakeFirst();
      return refused(exists ? "detail_not_in_model" : "element_not_found");
    }
    const structure = await trx
      .selectFrom("detail_proposal")
      .select("settled_at")
      .where("element_id", "=", element.id)
      .where("kind", "=", "structure")
      .executeTakeFirst();
    if (!structure?.settled_at) return refused("detail_structure_open");
    const values = await trx
      .selectFrom("element_value")
      .select(["text", "value"])
      .where("element_id", "=", element.id)
      .orderBy("position")
      .execute();
    if (values.length !== input.valueCodes.length) return refused("detail_value_codes_mismatch");

    const me = await actorMemberId(trx, project.id, userId);
    const code = input.code;
    const fields = {
      code_system: code?.system ?? null,
      code: code?.code ?? null,
      code_display: code?.display ?? null,
      binding_strength: input.bindingStrength,
      value_set_url: input.valueSetUrl,
      proposer_member_id: me,
      proposer_expert_type: project.role === "facilitator" ? null : "terminology",
      proposed_at: new Date(),
      settled_at: null,
      review_state: "pending",
      reviewer_member_id: null,
      review_note: null,
      reviewed_at: null,
    };
    const existing = await trx
      .selectFrom("detail_proposal")
      .select(["id", "version"])
      .where("element_id", "=", element.id)
      .where("kind", "=", "terminology")
      .forUpdate()
      .executeTakeFirst();
    if ((existing?.version ?? 0) !== input.version) return refused("detail_version_changed");
    const saved = existing
      ? await trx
          .updateTable("detail_proposal")
          .set({ ...fields, version: existing.version + 1 })
          .where("id", "=", existing.id)
          .returning(["id", "version"])
          .executeTakeFirstOrThrow()
      : await trx
          .insertInto("detail_proposal")
          .values({ ...fields, element_id: element.id, kind: "terminology" })
          .returning(["id", "version"])
          .executeTakeFirstOrThrow();
    // A code proposal keeps the settled values it codes, so the group reads what each code means.
    await trx.deleteFrom("detail_proposal_value").where("proposal_id", "=", saved.id).execute();
    if (values.length > 0) {
      await trx
        .insertInto("detail_proposal_value")
        .values(
          values.map((value, position) => {
            const valueCode = input.valueCodes[position] ?? null;
            return {
              proposal_id: saved.id,
              position,
              text: value.text,
              value: value.value,
              code_system: valueCode?.system ?? null,
              code: valueCode?.code ?? null,
              code_display: valueCode?.display ?? null,
            };
          }),
        )
        .execute();
    }
    await log(trx, userId, project.id, "detail_codes_proposed", "detail_proposal", saved.id);
    return done({ proposalId: saved.id, version: saved.version });
  });
}

/** The code proposal, locked, when it belongs to the project. */
async function lockedCodes(trx: Kysely<DB>, projectId: string, proposalId: string) {
  return trx
    .selectFrom("detail_proposal")
    .innerJoin("element", "element.id", "detail_proposal.element_id")
    .select([
      "detail_proposal.id",
      "detail_proposal.version",
      "detail_proposal.review_state",
      "detail_proposal.proposer_member_id",
      "detail_proposal.settled_at",
    ])
    .where("detail_proposal.id", "=", proposalId)
    .where("detail_proposal.kind", "=", "terminology")
    .where("element.project_id", "=", projectId)
    .forUpdate("detail_proposal")
    .executeTakeFirst();
}

/**
 * A second terminologist approves the current version of a code proposal, or returns it with a
 * note (DT4). Only a participant of a terminology group reviews (`detail_not_terminologist`),
 * never their own proposal (`detail_review_own`), in the detail phase (`phase_closed`), and only
 * a version that waits for review (`detail_review_not_pending`).
 */
export async function reviewCodes(
  db: Db,
  userId: string,
  input: ReviewCodesInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    if (project.role !== "participant") return refused("forbidden");
    if (!(await inExpertGroup(trx, project.id, userId, "terminology"))) {
      return refused("detail_not_terminologist");
    }
    if (!(await phaseOpenFor(trx, project, "detail_answer"))) return refused("phase_closed");
    const proposal = await lockedCodes(trx, project.id, input.proposalId);
    if (!proposal) return refused("detail_proposal_not_found");
    if (proposal.version !== input.version) return refused("detail_version_changed");
    if (proposal.review_state !== "pending") return refused("detail_review_not_pending");
    const me = await actorMemberId(trx, project.id, userId);
    if (proposal.proposer_member_id === me) return refused("detail_review_own");
    const approve = input.decision === "approve";
    await trx
      .updateTable("detail_proposal")
      .set({
        review_state: approve ? "approved" : "returned",
        reviewer_member_id: me,
        review_note: approve ? null : input.note,
        reviewed_at: new Date(),
      })
      .where("id", "=", proposal.id)
      .execute();
    await log(
      trx,
      userId,
      project.id,
      approve ? "detail_review_approved" : "detail_review_returned",
      "detail_proposal",
      proposal.id,
    );
    return done(null);
  });
}

/**
 * Skips the review of a code proposal, with the facilitator's reason (DT4, facilitator only, in
 * the detail phase). Refused with `detail_review_possible` while a terminologist other than the
 * proposer is in the project, and `detail_review_not_pending` for a version not waiting.
 */
export async function skipReview(
  db: Db,
  userId: string,
  input: SkipReviewInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    if (project.role !== "facilitator") return refused("forbidden");
    if (project.phase !== DETAIL_PHASE) return refused("phase_closed");
    const proposal = await lockedCodes(trx, project.id, input.proposalId);
    if (!proposal) return refused("detail_proposal_not_found");
    if (proposal.version !== input.version) return refused("detail_version_changed");
    if (proposal.review_state !== "pending") return refused("detail_review_not_pending");
    const reviewers = await terminologists(trx, project.id);
    if (reviewers.some((id) => id !== proposal.proposer_member_id)) {
      return refused("detail_review_possible");
    }
    await trx
      .updateTable("detail_proposal")
      .set({ review_state: "skipped", review_note: input.reason, reviewed_at: new Date() })
      .where("id", "=", proposal.id)
      .execute();
    await log(trx, userId, project.id, "detail_review_skipped", "detail_proposal", proposal.id);
    return done(null);
  });
}
