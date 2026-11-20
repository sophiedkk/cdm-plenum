// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Rating (DE3), own ratings with the previous round (DE7, DE8) and the facilitator's view by
// participant (DE4) on real PostgreSQL, with a negative test per role.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { createRound } from "./queries.ts";
import { clearRating, myRatings, ratingsByParticipant, saveRating } from "./ratings.ts";
import {
  closedNow,
  DAY,
  inDays,
  ok,
  openedRound,
  type PanelProject,
  panelProject,
} from "./test-round.ts";

let db: Kysely<DB>;
let p: PanelProject;
const now = () => ({ now: new Date() });

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db);
});

afterEach(async () => {
  await db.destroy();
});

function rate(
  userId: string,
  roundId: string,
  elementId: string,
  score: number | null,
  reason?: string,
) {
  return saveRating(db, userId, {
    projectId: p.projectId,
    roundId,
    elementId,
    score,
    ...(reason === undefined ? {} : { reason }),
  });
}

/** An open round whose closing date has passed, inserted directly: the service never opens one. */
async function pastDueRound(): Promise<string> {
  const row = await db
    .insertInto("round")
    .values({
      project_id: p.projectId,
      number: 1,
      closes_at: new Date(Date.now() - DAY),
      opened_at: new Date(Date.now() - 2 * DAY),
      panel_clinical: 2,
      minimum_clinical: 2,
      panel_terminology: 1,
      minimum_terminology: 1,
      panel_architecture: 2,
      minimum_architecture: 2,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("round_element")
    .values({ round_id: row.id, element_id: p.elements[0] })
    .execute();
  return row.id;
}

describe("saveRating and clearRating (DE3)", () => {
  it("saves, changes, skips and clears a rating with an optional reason", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const [first, second] = p.elements;
    ok(await rate(p.raters.n1, roundId, first, 8));
    ok(await rate(p.raters.n1, roundId, first, 6, "  Needed for triage  "));
    ok(await rate(p.raters.n1, roundId, second, null, "Outside my practice"));
    let mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    expect(mine.elements.map((e) => e.own)).toEqual([
      { rated: true, score: 6, reason: "Needed for triage" },
      { rated: true, score: null, reason: "Outside my practice" },
      { rated: false, score: null, reason: null },
    ]);
    ok(await clearRating(db, p.raters.n1, { projectId: p.projectId, roundId, elementId: first }));
    mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    expect(mine.elements[0]?.own).toEqual({ rated: false, score: null, reason: null });
  });

  it("stores the rating code and the rater's group, never the member", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await rate(p.raters.n1, roundId, p.elements[0], 7));
    const row = await db
      .selectFrom("rating")
      .innerJoin("team", "team.id", "rating.team_id")
      .select(["team.name"])
      .where("rating.round_id", "=", roundId)
      .executeTakeFirstOrThrow();
    expect(row.name).toBe("Nursing");
  });

  it("refuses a score outside the round's scale through the database trigger", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      rule: { scaleMin: 1, scaleMax: 5, bottomBandMax: 2, topBandMin: 4 },
    });
    expect(await rate(p.raters.n1, roundId, p.elements[0], 7)).toEqual({
      ok: false,
      error: "score_out_of_scale",
    });
  });

  it("refuses a rating in a closed round and after the closing date", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await rate(p.raters.n1, roundId, p.elements[0], 7));
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await rate(p.raters.n1, roundId, p.elements[0], 8)).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(
      await clearRating(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
      }),
    ).toEqual({ ok: false, error: "round_not_open" });
  });

  it("refuses a rating once the closing date has passed, before the facilitator closes", async () => {
    const roundId = await pastDueRound();
    expect(await rate(p.raters.n1, roundId, p.elements[0], 7)).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(
      await clearRating(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
      }),
    ).toEqual({ ok: false, error: "round_not_open" });
  });

  it("refuses a draft round, an unknown round and an element outside the round", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      elementIds: [p.elements[0]],
    });
    expect(await rate(p.raters.n1, roundId, p.elements[1], 7)).toEqual({
      ok: false,
      error: "element_not_in_round",
    });
    expect(
      await rate(p.raters.n1, "00000000-0000-4000-8000-000000000000", p.elements[0], 7),
    ).toEqual({ ok: false, error: "round_not_found" });
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const draft = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(1) }, now()),
    );
    expect(await rate(p.raters.n1, draft.roundId, p.elements[0], 7)).toEqual({
      ok: false,
      error: "round_not_found",
    });
    expect(
      await clearRating(db, p.raters.n1, {
        projectId: p.projectId,
        roundId: draft.roundId,
        elementId: p.elements[0],
      }),
    ).toEqual({ ok: false, error: "round_not_found" });
  });

  it("refuses a facilitator without a group (DE14) and a non-member (not_found)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const clear = { projectId: p.projectId, roundId, elementId: p.elements[0] };
    expect(await rate(p.facilitator, roundId, p.elements[0], 7)).toEqual({
      ok: false,
      error: "rater_group_required",
    });
    expect(await clearRating(db, p.facilitator, clear)).toEqual({
      ok: false,
      error: "rater_group_required",
    });
    expect(await db.selectFrom("rating").select("score").execute()).toEqual([]);
    expect(await rate(p.outsider, roundId, p.elements[0], 7)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await clearRating(db, p.outsider, clear)).toEqual({ ok: false, error: "not_found" });
  });

  it("logs that someone rated, with the round as target and no score or reason (Q-PRIV-2)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await rate(p.raters.n1, roundId, p.elements[0], 7, "Private reason"));
    ok(
      await clearRating(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
      }),
    );
    const rows = await db
      .selectFrom("activity_log")
      .select(["action", "target_type", "target_id"])
      .where("action", "in", ["rating_saved", "rating_cleared"])
      .orderBy("id")
      .execute();
    expect(rows).toEqual([
      { action: "rating_saved", target_type: "round", target_id: roundId },
      { action: "rating_cleared", target_type: "round", target_id: roundId },
    ]);
  });
});

describe("myRatings (DE4, DE7, DE8)", () => {
  it("shows participants the rater setting before they rate (DE4)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      facilitatorSeesRaters: true,
    });
    const mine = ok(await myRatings(db, p.raters.t1, { projectId: p.projectId, roundId }, now()));
    expect(mine.round.facilitatorSeesRaters).toBe(true);
    expect(mine.round.status).toBe("open");
    expect(mine.elements.every((e) => e.previous === null)).toBe(true);
  });

  it("shows in round 2 the own rating, the group result and the anonymous reasons of round 1", async () => {
    const first = await openedRound(db, p.facilitator, p.projectId);
    const [element] = p.elements;
    const scores = { n1: 9, n2: 8, t1: 2, a1: 5, a2: null } as const;
    for (const [name, score] of Object.entries(scores)) {
      const reason =
        name === "t1" ? "Belongs in another archetype" : name === "a1" ? "Unsure" : undefined;
      ok(await rate(p.raters[name as keyof typeof scores], first, element, score, reason));
    }
    await closedNow(db, p.facilitator, p.projectId, first);
    const second = await openedRound(db, p.facilitator, p.projectId);
    const mine = ok(
      await myRatings(db, p.raters.n2, { projectId: p.projectId, roundId: second }, now()),
    );
    expect(mine.round.number).toBe(2);
    expect(mine.elements.map((e) => e.id)).toEqual(p.elements);
    const previous = mine.elements[0]?.previous;
    expect(previous?.number).toBe(1);
    expect(previous?.own).toEqual({ rated: true, score: 8, reason: null });
    expect(previous?.result).toMatchObject({
      responses: 5,
      rated: 4,
      unableToRate: 1,
      median: 6.5,
      outcome: "no_consensus",
    });
    // No stakeholder group reached 3 scores, so none is shown on its own (Q-PRIV-3).
    expect(previous?.groups).toEqual([]);
    expect(previous?.reasons).toEqual(["Belongs in another archetype", "Unsure"]);
    // An element nobody rated in round 1 still shows its empty result.
    expect(mine.elements[1]?.previous?.own).toEqual({ rated: false, score: null, reason: null });
    expect(mine.elements[1]?.previous?.result.responses).toBe(0);
  });

  it("refuses a draft to a participant and a non-member", async () => {
    const { roundId } = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(1) }, now()),
    );
    const input = { projectId: p.projectId, roundId };
    expect(await myRatings(db, p.raters.n1, input, now())).toEqual({
      ok: false,
      error: "round_not_found",
    });
    expect(await myRatings(db, p.facilitator, input, now())).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(await myRatings(db, p.outsider, input, now())).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("ratingsByParticipant (DE4)", () => {
  it("is refused while the round's setting is off", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await rate(p.raters.n1, roundId, p.elements[0], 7));
    expect(
      await ratingsByParticipant(db, p.facilitator, { projectId: p.projectId, roundId }),
    ).toEqual({ ok: false, error: "raters_hidden" });
  });

  it("shows the facilitator each participant's ratings when the setting is on", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      facilitatorSeesRaters: true,
    });
    ok(await rate(p.raters.n1, roundId, p.elements[0], 7, "Core item"));
    ok(await rate(p.raters.t1, roundId, p.elements[0], null));
    const byRater = ok(
      await ratingsByParticipant(db, p.facilitator, { projectId: p.projectId, roundId }),
    );
    expect(byRater.map((r) => [r.email, r.groupName, r.ratings])).toEqual([
      ["n1@example.test", "Nursing", [{ elementId: p.elements[0], score: 7, reason: "Core item" }]],
      ["t1@example.test", "Terminology", [{ elementId: p.elements[0], score: null, reason: null }]],
    ]);
  });

  it("refuses a participant (forbidden), a non-member (not_found) and an unknown round", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      facilitatorSeesRaters: true,
    });
    const input = { projectId: p.projectId, roundId };
    expect(await ratingsByParticipant(db, p.raters.n1, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await ratingsByParticipant(db, p.outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await ratingsByParticipant(db, p.facilitator, {
        projectId: p.projectId,
        roundId: "00000000-0000-4000-8000-000000000000",
      }),
    ).toEqual({ ok: false, error: "round_not_found" });
  });
});

describe("myRatings in groups (DE19)", () => {
  async function placeInGroups(): Promise<void> {
    const groups = await db
      .selectFrom("element_group")
      .select(["id", "prompt"])
      .where("project_id", "=", p.projectId)
      .execute();
    const id = (prompt: string) => groups.find((group) => group.prompt === prompt)?.id ?? null;
    const [systolic, diastolic, cuff] = p.elements;
    await db
      .updateTable("element")
      .set({ group_id: id("recorded") })
      .where("id", "=", systolic)
      .execute();
    await db
      .updateTable("element")
      .set({ group_id: id("recorded") })
      .where("id", "=", diastolic)
      .execute();
    await db
      .updateTable("element")
      .set({ group_id: id("method") })
      .where("id", "=", cuff)
      .execute();
  }

  it("gives each element its group and keeps a group's elements together", async () => {
    await placeInGroups();
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    const prompts = mine.elements.map((element) => element.group?.prompt);
    expect(prompts.filter((prompt) => prompt === "recorded")).toHaveLength(2);
    // The two elements of one group sit next to each other, in the round's order.
    const recorded = mine.elements.filter((element) => element.group?.prompt === "recorded");
    expect(recorded.map((element) => element.name)).toEqual([
      "Systolic pressure",
      "Diastolic pressure",
    ]);
    const first = prompts.indexOf("recorded");
    expect(prompts[first + 1]).toBe("recorded");
    expect(JSON.stringify(mine)).not.toContain("@example.test");
  });

  it("keeps a rater's group order the same during the round", async () => {
    await placeInGroups();
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const input = { projectId: p.projectId, roundId };
    const once = ok(await myRatings(db, p.raters.a1, input, now()));
    await rate(p.raters.a1, roundId, p.elements[2], 7);
    const again = ok(await myRatings(db, p.raters.a1, input, now()));
    expect(again.elements.map((element) => element.id)).toEqual(
      once.elements.map((element) => element.id),
    );
  });

  it("lists an element without a group after the groups", async () => {
    const groups = await db
      .selectFrom("element_group")
      .select(["id", "prompt"])
      .where("project_id", "=", p.projectId)
      .execute();
    const method = groups.find((group) => group.prompt === "method")?.id ?? null;
    await db
      .updateTable("element")
      .set({ group_id: method })
      .where("id", "=", p.elements[2])
      .execute();
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const mine = ok(await myRatings(db, p.raters.t1, { projectId: p.projectId, roundId }, now()));
    expect(mine.elements.map((element) => element.group?.prompt ?? null)).toEqual([
      "method",
      null,
      null,
    ]);
  });
});
