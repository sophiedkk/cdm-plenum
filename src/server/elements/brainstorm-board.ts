// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm board (EL23, ADR 0020): one column per brainstorm question (EL14), with the
// elements from existing models, the member's own elements and, before the reveal (EL13), only
// the number of other people's elements. No author leaves this query (EL2); before the reveal a
// participant gets no word of another participant's elements.
import type { Kysely } from "kysely";
import { ELEMENT_PROMPTS, type ElementPrompt, isElementPrompt } from "@/lib/brainstorm";
import { type ElementReference, toReference } from "@/lib/elements";
import { stepVisible } from "@/lib/phase-access";
import type { DB } from "../db/schema.gen.ts";
import { done, type ProjectResult, readProject, refused } from "../projects/access.ts";
import { actorMemberId } from "../projects/member.ts";
import { inPrivateStep } from "./queries.ts";

/** An element as a card on the brainstorm board: its name and a line, nothing about its author. */
export interface BoardCard {
  id: string;
  name: string;
  description: string;
  /** The model a reference element refers to (EL26); null for a data element. */
  reference: ElementReference | null;
}

export interface BoardColumn {
  prompt: ElementPrompt;
  /** Elements from existing models under this question (EL7, EL18). */
  fromModels: BoardCard[];
  /** The reader's own elements. */
  own: BoardCard[];
  /** Other people's elements, once the reader may see them; empty before the reveal. */
  others: BoardCard[];
  /** Other people's elements the reader may not see yet: a count only (EL13). */
  hidden: number;
}

export interface BrainstormBoard {
  columns: BoardColumn[];
  /** Whether other people's elements are hidden from the reader (EL13). */
  privateStep: boolean;
  /**
   * Every element on the board, under a question or not, to compare a typed name with (EL15);
   * null in the private step, so no hint names another person's element.
   */
  hints: BoardCard[] | null;
  participants: number;
  /** Participants who added at least one element of their own. */
  contributors: number;
  /** Elements people added, those from existing models left out. */
  added: number;
  /** Elements the reader added. */
  own: number;
}

/**
 * The brainstorm board for any member while the phase shows the brainstorm (`phase_closed`
 * otherwise). In the private step a participant receives their own elements, the elements from
 * existing models and counts; the facilitator receives every element, without authors.
 */
export async function brainstormBoard(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<BrainstormBoard>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    if (!stepVisible(project.role, project.phase, "brainstorm")) return refused("phase_closed");
    const me = await actorMemberId(reader, project.id, userId);
    const privateStep = project.role !== "facilitator" && (await inPrivateStep(reader, project.id));
    const rows = await reader
      .selectFrom("element")
      .leftJoin("member", "member.id", "element.author_member_id")
      .select((eb) => [
        "element.id",
        "element.name",
        "element.description",
        "element.prompt",
        "element.kind",
        "element.reference_title",
        "element.reference_url",
        "element.author_member_id",
        "member.role",
        eb
          .exists(
            eb
              .selectFrom("element_source_link as link")
              .select("link.element_id")
              .whereRef("link.element_id", "=", "element.id"),
          )
          .as("imported"),
      ])
      .where("element.project_id", "=", project.id)
      .where("element.merged_into", "is", null)
      .orderBy("element.created_at")
      .orderBy("element.id")
      .execute();
    const columns: BoardColumn[] = ELEMENT_PROMPTS.map((prompt) => ({
      prompt,
      fromModels: [],
      own: [],
      others: [],
      hidden: 0,
    }));
    const hints: BoardCard[] = [];
    const contributors = new Set<string>();
    let added = 0;
    let own = 0;
    for (const row of rows) {
      const card = {
        id: row.id,
        name: row.name,
        description: row.description,
        reference: toReference(row),
      };
      const mine = row.author_member_id === me;
      if (!privateStep) hints.push(card);
      if (!row.imported) {
        added += 1;
        if (mine) own += 1;
        if (row.role === "participant" && row.author_member_id !== null) {
          contributors.add(row.author_member_id);
        }
      }
      if (!isElementPrompt(row.prompt)) continue;
      const column = columns[ELEMENT_PROMPTS.indexOf(row.prompt)];
      if (!column) continue;
      if (row.imported) column.fromModels.push(card);
      else if (mine) column.own.push(card);
      else if (privateStep) column.hidden += 1;
      else column.others.push(card);
    }
    const participants = await reader
      .selectFrom("member")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("organizationId", "=", project.id)
      .where("role", "=", "participant")
      .executeTakeFirstOrThrow();
    return done({
      columns,
      privateStep,
      hints: privateStep ? null : hints,
      participants: Number(participants.count),
      contributors: contributors.size,
      added,
      own,
    });
  });
}
