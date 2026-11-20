// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Invented projects with a panel and elements for the round tests.
import type { Kysely } from "kysely";
import type { ProjectPhase } from "@/lib/project-phases";
import type { DB } from "../db/schema.gen.ts";
import {
  facilitatorWithProject,
  insertElement,
  insertUser,
  joinedParticipant,
  setPhase,
} from "../test-fixtures.ts";
import type { RoundResult } from "./access.ts";
import { closeRound, createRound, openRound } from "./queries.ts";
import type { CreateRoundInput } from "./schemas.ts";

export const DAY = 86_400_000;

/** A moment `days` from now; the rating trigger compares with the database clock. */
export function inDays(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

/** The value of a result that must succeed. */
export function ok<T>(result: RoundResult<T>): T {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

export interface PanelProject {
  facilitator: string;
  projectId: string;
  /** Participants by name: two nurses, one terminologist, two architects (class D complete). */
  raters: Record<"n1" | "n2" | "t1" | "a1" | "a2", string>;
  outsider: string;
  elements: [string, string, string];
}

/**
 * A class D project whose panel meets the minimum, with three elements on the board. It is in
 * the decide phase unless `phase` says otherwise, as a round opens there only (PR10).
 */
export async function panelProject(
  db: Kysely<DB>,
  phase: ProjectPhase = "decide",
): Promise<PanelProject> {
  const { userId: facilitator, projectId } = await facilitatorWithProject(db);
  await setPhase(db, projectId, phase);
  const join = (group: string, name: string) =>
    joinedParticipant(db, facilitator, projectId, group, name);
  const raters = {
    n1: await join("Nursing", "n1"),
    n2: await join("Nursing", "n2"),
    t1: await join("Terminology", "t1"),
    a1: await join("Architecture", "a1"),
    a2: await join("Architecture", "a2"),
  };
  const outsider = await insertUser(db, "out");
  const elements: [string, string, string] = [
    await insertElement(db, projectId, "Systolic pressure"),
    await insertElement(db, projectId, "Diastolic pressure"),
    await insertElement(db, projectId, "Cuff size"),
  ];
  return { facilitator, projectId, raters, outsider, elements };
}

/** Creates and opens a round that closes in one day; returns its id. */
export async function openedRound(
  db: Kysely<DB>,
  facilitator: string,
  projectId: string,
  input: Partial<CreateRoundInput> = {},
  belowMinimumReason?: string,
): Promise<string> {
  const { roundId } = ok(
    await createRound(
      db,
      facilitator,
      { projectId, closesAt: inDays(1), ...input },
      { now: new Date() },
    ),
  );
  ok(
    await openRound(
      db,
      facilitator,
      { projectId, roundId, ...(belowMinimumReason === undefined ? {} : { belowMinimumReason }) },
      { now: new Date() },
    ),
  );
  return roundId;
}

/** Closes a round as if its closing date had passed. */
export async function closedNow(
  db: Kysely<DB>,
  facilitator: string,
  projectId: string,
  roundId: string,
) {
  return ok(await closeRound(db, facilitator, { projectId, roundId }, { now: inDays(2) }));
}
