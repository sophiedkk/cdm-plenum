// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The phase move and the overview counts (PR4, PR8, Q-SEC-1, Q-ANON-1) on real PostgreSQL.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { addElement } from "../elements/queries.ts";
import { saveRating } from "../rounds/ratings.ts";
import {
  closedNow,
  inDays,
  ok,
  openedRound,
  type PanelProject,
  panelProject,
} from "../rounds/test-round.ts";
import { groupId } from "../test-fixtures.ts";
import { personLeaks, projectWithMembers } from "../test-project-members.ts";
import type { ProjectResult } from "./access.ts";
import { movePhase, projectOverview } from "./phase.ts";
import { setRaterGroup } from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

/** The value of a project result that must succeed. */
function value<T>(result: ProjectResult<T>): T {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

/** Adds an element as `userId`, so they are its author. */
async function add(userId: string, projectId: string, name: string): Promise<void> {
  value(
    await addElement(db, userId, {
      projectId,
      name,
      description: "",
      dataType: null,
      cardinality: null,
      source: "",
      prompt: null,
    }),
  );
}

async function phaseOf(projectId: string): Promise<string> {
  const row = await db
    .selectFrom("project")
    .select("phase")
    .where("id", "=", projectId)
    .executeTakeFirstOrThrow();
  return row.phase;
}

describe("movePhase (PR4)", () => {
  it("moves the project one phase on and back, and logs each move", async () => {
    const p = await projectWithMembers(db);
    const next = await movePhase(db, p.facilitator, {
      projectId: p.projectId,
      from: "scope",
      direction: "next",
    });
    expect(next).toEqual({ ok: true, value: { phase: "discover" } });
    const back = await movePhase(db, p.facilitator, {
      projectId: p.projectId,
      from: "discover",
      direction: "previous",
    });
    expect(back).toEqual({ ok: true, value: { phase: "scope" } });
    expect(await phaseOf(p.projectId)).toBe("scope");
    const logged = await db
      .selectFrom("activity_log")
      .select(["action", "actor_user_id", "target_type", "target_id"])
      .where("project_id", "=", p.projectId)
      .where("action", "like", "phase_%")
      .orderBy("occurred_at")
      .orderBy("id")
      .execute();
    expect(logged).toEqual([
      {
        action: "phase_moved_to_discover",
        actor_user_id: p.facilitator,
        target_type: "project",
        target_id: p.projectId,
      },
      {
        action: "phase_moved_to_scope",
        actor_user_id: p.facilitator,
        target_type: "project",
        target_id: p.projectId,
      },
    ]);
  });

  it("refuses a participant (forbidden) and an outsider (not_found)", async () => {
    const p = await projectWithMembers(db);
    const input = { projectId: p.projectId, from: "scope", direction: "next" } as const;
    expect(await movePhase(db, p.participant, input)).toEqual({ ok: false, error: "forbidden" });
    expect(await movePhase(db, p.outsider, input)).toEqual({ ok: false, error: "not_found" });
    expect(await phaseOf(p.projectId)).toBe("scope");
  });

  it("refuses a move back from the first phase", async () => {
    const p = await projectWithMembers(db);
    const result = await movePhase(db, p.facilitator, {
      projectId: p.projectId,
      from: "scope",
      direction: "previous",
    });
    expect(result).toEqual({ ok: false, error: "no_previous_phase" });
  });

  it("refuses a move on from the last phase", async () => {
    const p = await projectWithMembers(db);
    await db
      .updateTable("project")
      .set({ phase: "handoff" })
      .where("id", "=", p.projectId)
      .execute();
    const result = await movePhase(db, p.facilitator, {
      projectId: p.projectId,
      from: "handoff",
      direction: "next",
    });
    expect(result).toEqual({ ok: false, error: "no_next_phase" });
    expect(await phaseOf(p.projectId)).toBe("handoff");
  });

  it("refuses a move from a phase the project is no longer in, so a double click skips nothing", async () => {
    const p = await projectWithMembers(db);
    const input = { projectId: p.projectId, from: "scope", direction: "next" } as const;
    expect((await movePhase(db, p.facilitator, input)).ok).toBe(true);
    expect(await movePhase(db, p.facilitator, input)).toEqual({
      ok: false,
      error: "phase_changed",
    });
    expect(await phaseOf(p.projectId)).toBe("discover");
  });
});

describe("projectOverview (PR8)", () => {
  it("counts the participant's own elements only, and names nobody (Q-ANON-1)", async () => {
    // Participants add elements in the discover phase (PR9).
    const p = await projectWithMembers(db, "discover");
    await add(p.participant, p.projectId, "Systolic");
    await add(p.participant, p.projectId, "Diastolic");
    await add(p.otherParticipant, p.projectId, "Cuff");
    const result = value(
      await projectOverview(db, p.participant, p.projectId, { now: new Date() }),
    );
    expect(result).toEqual({
      phase: "discover",
      role: "participant",
      elements: 3,
      ownElements: 2,
      round: null,
      lastClosedRoundId: null,
    });
    expect(personLeaks(result, p)).toEqual([]);
  });

  it("refuses an outsider with not_found", async () => {
    const p = await projectWithMembers(db);
    expect(await projectOverview(db, p.outsider, p.projectId, { now: new Date() })).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  describe("with an open round", () => {
    let p: PanelProject;
    let roundId: string;

    beforeEach(async () => {
      p = await panelProject(db);
      roundId = await openedRound(db, p.facilitator, p.projectId);
      const rate = (rater: string, elementId: string) =>
        saveRating(db, rater, { projectId: p.projectId, roundId, elementId, score: 7 });
      for (const elementId of p.elements) ok(await rate(p.raters.n1, elementId));
      ok(await rate(p.raters.n2, p.elements[0]));
    });

    it("gives a participant their own answered count and no response", async () => {
      const result = value(
        await projectOverview(db, p.raters.n2, p.projectId, { now: new Date() }),
      );
      expect(result.round).toMatchObject({
        id: roundId,
        number: 1,
        status: "open",
        elements: 3,
        rated: 1,
        completed: null,
        raters: null,
      });
    });

    it("gives the facilitator the response, and no own count until they join a group (DE14)", async () => {
      const overview = async () =>
        value(await projectOverview(db, p.facilitator, p.projectId, { now: new Date() }));
      const before = await overview();
      expect(before.round).toMatchObject({ rated: null, completed: 1, raters: 5 });
      const nursing = await groupId(db, p.projectId, "Nursing");
      value(await setRaterGroup(db, p.facilitator, { projectId: p.projectId, groupId: nursing }));
      const after = await overview();
      expect(after.round).toMatchObject({ rated: 0, completed: 1, raters: 6 });
    });

    it("shows the round as awaiting close once its closing date has passed", async () => {
      const result = value(await projectOverview(db, p.raters.n1, p.projectId, { now: inDays(2) }));
      expect(result.round).toMatchObject({ id: roundId, status: "awaiting_close" });
    });

    it("names the closed round once the facilitator closes it", async () => {
      await closedNow(db, p.facilitator, p.projectId, roundId);
      const result = value(
        await projectOverview(db, p.raters.n1, p.projectId, { now: new Date() }),
      );
      expect(result.round).toBeNull();
      expect(result.lastClosedRoundId).toBe(roundId);
    });
  });
});
