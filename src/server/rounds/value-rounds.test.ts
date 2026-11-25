// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Value rounds (DT3, owner decision 2026-11-24) on real PostgreSQL: the value lists of structure
// proposals go into a round of kind `values`, raters score each value under its element, the
// DE1 rule gives each value an outcome, and applying a closed round turns the kept values into a
// new version of the proposal. Every refusal is asserted per role and phase, and no response
// names a person (Q-ANON-1).
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DetailStructure } from "@/lib/details";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { detailBoard, proposeDetail, settleDetail } from "../details/queries.ts";
import { closedRoundWithOutcomes, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks } from "../test-project-members.ts";
import { closeRound, createRound, openRound, updateRound } from "./queries.ts";
import {
  clearValueRating,
  myRatings,
  ratingsByParticipant,
  saveRating,
  saveValueRating,
} from "./ratings.ts";
import { responseRate, roundResults } from "./results.ts";
import { inDays, ok, type PanelProject, panelProject } from "./test-round.ts";
import { addValueList, applyValueList, removeValueList } from "./value-rounds.ts";

let db: Kysely<DB>;
let p: PanelProject;
let proposals: [string, string];

function must<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

const now = () => ({ now: new Date() });
/** A date after the closing date of a new value round (14 days). */
const AFTER_CLOSING = inDays(15);

const SEVERITY: DetailStructure = {
  dataType: "coded_text",
  cardinality: { min: 0, max: 1 },
  units: [],
  values: [
    { text: "Mild", value: null },
    { text: "Moderate", value: null },
    { text: "Severe", value: null },
  ],
};

const SITE: DetailStructure = {
  dataType: "coded_text",
  cardinality: { min: 1, max: 1 },
  units: [],
  values: [
    { text: "Left arm", value: null },
    { text: "Right arm", value: null },
  ],
};

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db, "detail");
  await closedRoundWithOutcomes(db, p.projectId, [
    [p.elements[0], "included"],
    [p.elements[1], "included"],
    [p.elements[2], "excluded"],
  ]);
  const propose = async (elementId: string, structure: DetailStructure) => {
    const result = await proposeDetail(db, p.facilitator, {
      projectId: p.projectId,
      elementId,
      version: 0,
      ...structure,
    });
    if (!result.ok) throw new Error(result.error);
    return result.value.proposalId;
  };
  proposals = [await propose(p.elements[0], SEVERITY), await propose(p.elements[1], SITE)];
});

afterEach(async () => {
  await db.destroy();
});

const add = (userId: string, proposalId: string) =>
  addValueList(db, userId, { projectId: p.projectId, proposalId }, now());

/** A draft value round holding both lists. */
async function draftRound(): Promise<string> {
  const { roundId } = ok(await add(p.facilitator, proposals[0]));
  ok(await add(p.facilitator, proposals[1]));
  return roundId;
}

async function openValueRound(): Promise<string> {
  const roundId = await draftRound();
  ok(await openRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
  return roundId;
}

async function valueIds(roundId: string): Promise<Map<string, string>> {
  const rows = await db
    .selectFrom("round_value")
    .select(["id", "text"])
    .where("round_id", "=", roundId)
    .execute();
  return new Map(rows.map((row) => [row.text, row.id]));
}

const rate = (userId: string, roundId: string, valueId: string, score: number | null) =>
  saveValueRating(db, userId, { projectId: p.projectId, roundId, valueId, score });

/** Every rater scores `scores[i]` for the value `text`. */
async function rateAll(roundId: string, text: string, scores: (number | null)[]) {
  const ids = await valueIds(roundId);
  const raters = Object.values(p.raters);
  for (const [index, rater] of raters.entries()) {
    ok(await rate(rater, roundId, ids.get(text) as string, scores[index] as number | null));
  }
}

/** Mild 9 from all (kept), Moderate 1 from all (left out), Severe mixed (no consensus). */
async function rateSeverity(roundId: string) {
  await rateAll(roundId, "Mild", [9, 9, 9, 9, 9]);
  await rateAll(roundId, "Moderate", [1, 1, 1, 1, 1]);
  await rateAll(roundId, "Severe", [9, 9, 5, 5, 1]);
  await rateAll(roundId, "Left arm", [8, 8, 8, 8, 8]);
  await rateAll(roundId, "Right arm", [9, 9, 9, 9, 9]);
}

async function closedValueRound(): Promise<string> {
  const roundId = await openValueRound();
  await rateSeverity(roundId);
  ok(
    await closeRound(
      db,
      p.facilitator,
      { projectId: p.projectId, roundId },
      { now: AFTER_CLOSING },
    ),
  );
  return roundId;
}

describe("addValueList (DT3)", () => {
  it("starts a draft value round with the first list and adds the next list to it", async () => {
    const first = ok(await add(p.facilitator, proposals[0]));
    expect(first.number).toBe(2);
    const second = ok(await add(p.facilitator, proposals[1]));
    expect(second.roundId).toBe(first.roundId);
    const round = await db
      .selectFrom("round")
      .selectAll()
      .where("id", "=", first.roundId)
      .executeTakeFirstOrThrow();
    expect(round).toMatchObject({ kind: "values", opened_at: null, scale_min: 1, scale_max: 9 });
    const values = await db
      .selectFrom("round_value")
      .select(["text", "position", "proposal_id"])
      .where("round_id", "=", first.roundId)
      .orderBy("proposal_id")
      .orderBy("position")
      .execute();
    expect(values.map((value) => value.text).sort()).toEqual(
      ["Left arm", "Mild", "Moderate", "Right arm", "Severe"].sort(),
    );
  });

  it("copies the values, so a later revision does not change what the round rates", async () => {
    const roundId = await draftRound();
    const list = await db
      .selectFrom("round_value_list")
      .select("version")
      .where("round_id", "=", roundId)
      .where("proposal_id", "=", proposals[0])
      .executeTakeFirstOrThrow();
    expect(list.version).toBe(1);
  });

  it("takes the next round number after an element round, and an element round after it", async () => {
    const { number } = ok(await add(p.facilitator, proposals[0]));
    expect(number).toBe(2);
    const element = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(3) }, now()),
    );
    expect(element.number).toBe(3);
  });

  it("refuses a participant and an outsider", async () => {
    expect(await add(p.raters.n1, proposals[0])).toEqual({ ok: false, error: "forbidden" });
    expect(await add(p.outsider, proposals[0])).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses once the project is past the detail phase (PR10)", async () => {
    await setPhase(db, p.projectId, "handoff");
    expect(await add(p.facilitator, proposals[0])).toEqual({ ok: false, error: "phase_closed" });
  });

  it("prepares ahead in the decide phase", async () => {
    await setPhase(db, p.projectId, "decide");
    expect((await add(p.facilitator, proposals[0])).ok).toBe(true);
  });

  it("refuses a proposal that is not a structure proposal of an element in the model", async () => {
    const unknown = "0190a6b1-0000-7000-8000-000000000000";
    expect(await add(p.facilitator, unknown)).toEqual({ ok: false, error: "value_list_not_found" });
    // An element a later round left out of the model has no list to rate.
    await db
      .updateTable("round_element")
      .set({ outcome: "excluded" })
      .where("element_id", "=", p.elements[0])
      .execute();
    expect(await add(p.facilitator, proposals[0])).toEqual({
      ok: false,
      error: "value_list_not_found",
    });
  });

  it("refuses a proposal without values", async () => {
    const quantity = must(
      await proposeDetail(db, p.facilitator, {
        projectId: p.projectId,
        elementId: p.elements[0],
        version: 1,
        dataType: "quantity",
        cardinality: { min: 1, max: 1 },
        units: [],
        values: [],
      }),
    );
    expect(await add(p.facilitator, quantity.proposalId)).toEqual({
      ok: false,
      error: "value_list_empty",
    });
  });

  it("refuses a settled proposal", async () => {
    must(
      await settleDetail(db, p.facilitator, {
        projectId: p.projectId,
        proposalId: proposals[0],
        version: 1,
      }),
    );
    expect(await add(p.facilitator, proposals[0])).toEqual({
      ok: false,
      error: "value_list_settled",
    });
  });

  it("refuses a list that is already in a round that is not closed", async () => {
    await add(p.facilitator, proposals[0]);
    expect(await add(p.facilitator, proposals[0])).toEqual({
      ok: false,
      error: "value_list_in_round",
    });
  });

  it("refuses a new list while a value round is open", async () => {
    const { roundId } = ok(await add(p.facilitator, proposals[0]));
    ok(await openRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(await add(p.facilitator, proposals[1])).toEqual({
      ok: false,
      error: "previous_round_not_closed",
    });
  });
});

describe("removeValueList (DT3)", () => {
  it("takes a list out of a draft round, and only the facilitator may", async () => {
    const roundId = await draftRound();
    const input = { projectId: p.projectId, roundId, proposalId: proposals[0] };
    expect(await removeValueList(db, p.raters.n1, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await removeValueList(db, p.outsider, input)).toEqual({ ok: false, error: "not_found" });
    ok(await removeValueList(db, p.facilitator, input));
    expect(await removeValueList(db, p.facilitator, input)).toEqual({
      ok: false,
      error: "value_list_not_found",
    });
    const left = await db
      .selectFrom("round_value")
      .select("id")
      .where("round_id", "=", roundId)
      .execute();
    expect(left).toHaveLength(2);
  });

  it("refuses once the round is open, and for an element round", async () => {
    const roundId = await openValueRound();
    expect(
      await removeValueList(db, p.facilitator, {
        projectId: p.projectId,
        roundId,
        proposalId: proposals[0],
      }),
    ).toEqual({ ok: false, error: "round_not_draft" });
    const elementRound = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(3) }, now()),
    );
    expect(
      await removeValueList(db, p.facilitator, {
        projectId: p.projectId,
        roundId: elementRound.roundId,
        proposalId: proposals[0],
      }),
    ).toEqual({ ok: false, error: "round_not_found" });
  });
});

describe("opening a value round (DT3, PR10)", () => {
  it("opens in the detail phase only", async () => {
    const roundId = await draftRound();
    const input = { projectId: p.projectId, roundId };
    await setPhase(db, p.projectId, "decide");
    expect(await openRound(db, p.facilitator, input, now())).toEqual({
      ok: false,
      error: "round_outside_detail",
    });
    await setPhase(db, p.projectId, "detail");
    expect((await openRound(db, p.facilitator, input, now())).ok).toBe(true);
  });

  it("an element round still opens in the decide phase only", async () => {
    const created = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(3) }, now()),
    );
    expect(
      await openRound(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId: created.roundId },
        now(),
      ),
    ).toEqual({ ok: false, error: "round_outside_decide" });
  });

  it("refuses a change of the elements of a value round", async () => {
    const roundId = await draftRound();
    expect(
      await updateRound(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId, elementIds: [p.elements[0]] },
        now(),
      ),
    ).toEqual({ ok: false, error: "value_round_items" });
  });
});

describe("rating the values (DT3)", () => {
  it("saves, changes and clears a score of a value, and shows the values under their element", async () => {
    const roundId = await openValueRound();
    const ids = await valueIds(roundId);
    const mild = ids.get("Mild") as string;
    ok(await rate(p.raters.n1, roundId, mild, 7));
    ok(await rate(p.raters.n1, roundId, mild, 8));
    const mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    expect(mine.round.kind).toBe("values");
    expect(mine.elements).toHaveLength(5);
    const own = mine.elements.find((item) => item.id === mild);
    expect(own).toMatchObject({
      name: "Mild",
      own: { rated: true, score: 8 },
      group: { name: "Systolic pressure" },
      previous: null,
    });
    // Under one heading per element, each list together; the test transaction gives both
    // elements one creation time, so the order of the headings is not asserted.
    const headings = mine.elements.map((item) => item.group?.name);
    expect(headings.filter((name, index) => name !== headings[index - 1])).toHaveLength(2);
    expect(headings.sort()).toEqual([
      "Diastolic pressure",
      "Diastolic pressure",
      "Systolic pressure",
      "Systolic pressure",
      "Systolic pressure",
    ]);
    ok(await clearValueRating(db, p.raters.n1, { projectId: p.projectId, roundId, valueId: mild }));
    const cleared = ok(
      await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()),
    );
    expect(cleared.elements.find((item) => item.id === mild)?.own.rated).toBe(false);
  });

  it("takes 'unable to rate' as no score", async () => {
    const roundId = await openValueRound();
    const ids = await valueIds(roundId);
    ok(await rate(p.raters.a1, roundId, ids.get("Mild") as string, null));
    const mine = ok(await myRatings(db, p.raters.a1, { projectId: p.projectId, roundId }, now()));
    expect(mine.elements.find((item) => item.id === ids.get("Mild"))?.own).toMatchObject({
      rated: true,
      score: null,
    });
  });

  it("refuses a score off the scale, a value outside the round and the wrong kind of item", async () => {
    const roundId = await openValueRound();
    const ids = await valueIds(roundId);
    expect(await rate(p.raters.n1, roundId, ids.get("Mild") as string, 12)).toEqual({
      ok: false,
      error: "score_out_of_scale",
    });
    expect(await rate(p.raters.n1, roundId, "0190a6b1-0000-7000-8000-000000000000", 5)).toEqual({
      ok: false,
      error: "value_not_in_round",
    });
    expect(
      await saveRating(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
        score: 5,
      }),
    ).toEqual({ ok: false, error: "element_not_in_round" });
  });

  it("refuses a value of another round and a rating in an element round", async () => {
    const roundId = await closedValueRound();
    const ids = await valueIds(roundId);
    const second = ok(await add(p.facilitator, proposals[0]));
    ok(
      await openRound(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId: second.roundId },
        now(),
      ),
    );
    expect(await rate(p.raters.n1, second.roundId, ids.get("Mild") as string, 5)).toEqual({
      ok: false,
      error: "value_not_in_round",
    });
  });

  it("refuses an outsider, a facilitator without a group and a rating outside the detail phase", async () => {
    const roundId = await openValueRound();
    const ids = await valueIds(roundId);
    const mild = ids.get("Mild") as string;
    expect(await rate(p.outsider, roundId, mild, 5)).toEqual({ ok: false, error: "not_found" });
    expect(await rate(p.facilitator, roundId, mild, 5)).toEqual({
      ok: false,
      error: "rater_group_required",
    });
    for (const phase of ["decide", "handoff"] as const) {
      await setPhase(db, p.projectId, phase);
      expect(await rate(p.raters.n1, roundId, mild, 5)).toEqual({
        ok: false,
        error: "phase_closed",
      });
    }
  });

  it("refuses a rating once the round is closed", async () => {
    const roundId = await closedValueRound();
    const ids = await valueIds(roundId);
    expect(await rate(p.raters.n1, roundId, ids.get("Mild") as string, 5)).toEqual({
      ok: false,
      error: "round_not_open",
    });
  });

  it("refuses an element rating of a value round's kind the other way round", async () => {
    // An element round takes no value rating (DT3).
    const element = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(3) }, now()),
    );
    expect(await rate(p.raters.n1, element.roundId, p.elements[0], 5)).toEqual({
      ok: false,
      error: "round_not_found",
    });
  });
});

describe("the outcome of a value round (DE1, DT3)", () => {
  it("gives each value the outcome of the DE1 rule and counts the lists", async () => {
    const roundId = await closedValueRound();
    const results = ok(
      await roundResults(db, p.raters.n1, { projectId: p.projectId, roundId }, now()),
    );
    expect(results.round.kind).toBe("values");
    const outcomes = Object.fromEntries(results.elements.map((item) => [item.name, item.outcome]));
    expect(outcomes).toEqual({
      Mild: "included",
      Moderate: "excluded",
      Severe: "no_consensus",
      "Left arm": "included",
      "Right arm": "included",
    });
    expect(results.elements.find((item) => item.name === "Mild")?.group?.name).toBe(
      "Systolic pressure",
    );
    expect(results.lists.map((list) => [list.elementName, list.total, list.kept]).sort()).toEqual([
      ["Diastolic pressure", 2, 2],
      ["Systolic pressure", 3, 1],
    ]);
  });

  it("follows a changed rule", async () => {
    const roundId = await draftRound();
    ok(
      await updateRound(
        db,
        p.facilitator,
        {
          projectId: p.projectId,
          roundId,
          rule: {
            scaleMin: 1,
            scaleMax: 9,
            bottomBandMax: 3,
            topBandMin: 5,
            agreementPct: 70,
            oppositionPct: 20,
          },
        },
        now(),
      ),
    );
    ok(await openRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    await rateSeverity(roundId);
    ok(
      await closeRound(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId },
        { now: AFTER_CLOSING },
      ),
    );
    const results = ok(
      await roundResults(db, p.raters.n1, { projectId: p.projectId, roundId }, now()),
    );
    expect(results.elements.find((item) => item.name === "Severe")?.outcome).toBe("included");
  });

  it("counts the response in values", async () => {
    const roundId = await openValueRound();
    await rateSeverity(roundId);
    const ids = await valueIds(roundId);
    ok(
      await clearValueRating(db, p.raters.n2, {
        projectId: p.projectId,
        roundId,
        valueId: ids.get("Mild") as string,
      }),
    );
    const rate = ok(
      await responseRate(db, p.facilitator, { projectId: p.projectId, roundId }, now()),
    );
    expect(rate.total).toMatchObject({ started: 5, completed: 4 });
  });
});

describe("applyValueList (DT3)", () => {
  const apply = (userId: string, roundId: string, proposalId: string) =>
    applyValueList(db, userId, { projectId: p.projectId, roundId, proposalId });

  it("makes the kept values, in their order, a new version with the same type and cardinality", async () => {
    const roundId = await closedValueRound();
    const applied = ok(await apply(p.facilitator, roundId, proposals[0]));
    expect(applied.version).toBe(2);
    const proposal = await db
      .selectFrom("detail_proposal")
      .selectAll()
      .where("id", "=", proposals[0])
      .executeTakeFirstOrThrow();
    expect(proposal).toMatchObject({
      version: 2,
      data_type: "coded_text",
      min_occurs: 0,
      max_occurs: 1,
      settled_at: null,
    });
    const values = await db
      .selectFrom("detail_proposal_value")
      .select(["text", "position"])
      .where("proposal_id", "=", proposals[0])
      .orderBy("position")
      .execute();
    expect(values).toEqual([{ text: "Mild", position: 0 }]);
    const list = await db
      .selectFrom("round_value_list")
      .select(["applied_version", "applied_at"])
      .where("round_id", "=", roundId)
      .where("proposal_id", "=", proposals[0])
      .executeTakeFirstOrThrow();
    expect(list.applied_version).toBe(2);
    expect(list.applied_at).not.toBeNull();
  });

  it("settles nothing: the new version waits for the group's answers (DT2)", async () => {
    const roundId = await closedValueRound();
    ok(await apply(p.facilitator, roundId, proposals[0]));
    const board = await detailBoard(db, p.facilitator, p.projectId);
    if (!board.ok) throw new Error(board.error);
    const element = board.value.elements.find((item) => item.id === p.elements[0]);
    expect(element?.proposal).toMatchObject({ version: 2, settledAt: null });
    expect(element?.valueRound).toMatchObject({
      status: "closed",
      version: 1,
      appliedVersion: 2,
    });
  });

  it("refuses a list that kept every value", async () => {
    const roundId = await closedValueRound();
    expect(await apply(p.facilitator, roundId, proposals[1])).toEqual({
      ok: false,
      error: "value_list_unchanged",
    });
  });

  it("refuses to apply a list twice, and a list that is not in the round", async () => {
    const roundId = await closedValueRound();
    ok(await apply(p.facilitator, roundId, proposals[0]));
    expect(await apply(p.facilitator, roundId, proposals[0])).toEqual({
      ok: false,
      error: "value_list_applied",
    });
    expect(await apply(p.facilitator, roundId, "0190a6b1-0000-7000-8000-000000000000")).toEqual({
      ok: false,
      error: "value_list_not_found",
    });
  });

  it("refuses before the round is closed and for an element round", async () => {
    const roundId = await openValueRound();
    expect(await apply(p.facilitator, roundId, proposals[0])).toEqual({
      ok: false,
      error: "round_not_closed",
    });
    const elementRound = (
      await db
        .selectFrom("round")
        .select("id")
        .where("project_id", "=", p.projectId)
        .where("kind", "=", "elements")
        .executeTakeFirstOrThrow()
    ).id;
    expect(await apply(p.facilitator, elementRound, proposals[0])).toEqual({
      ok: false,
      error: "round_not_found",
    });
  });

  it("refuses a proposal that has a newer version than the round rated", async () => {
    const roundId = await closedValueRound();
    must(
      await proposeDetail(db, p.facilitator, {
        projectId: p.projectId,
        elementId: p.elements[0],
        version: 1,
        ...SEVERITY,
      }),
    );
    expect(await apply(p.facilitator, roundId, proposals[0])).toEqual({
      ok: false,
      error: "value_list_changed",
    });
  });

  it("refuses a participant, an outsider and a project past the detail phase", async () => {
    const roundId = await closedValueRound();
    expect(await apply(p.raters.n1, roundId, proposals[0])).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await apply(p.outsider, roundId, proposals[0])).toEqual({
      ok: false,
      error: "not_found",
    });
    await setPhase(db, p.projectId, "handoff");
    expect(await apply(p.facilitator, roundId, proposals[0])).toEqual({
      ok: false,
      error: "phase_closed",
    });
  });
});

describe("a proposal in a value round (DT3)", () => {
  const revise = (version = 1) =>
    proposeDetail(db, p.facilitator, {
      projectId: p.projectId,
      elementId: p.elements[0],
      version,
      ...SEVERITY,
    });
  const settle = () =>
    settleDetail(db, p.facilitator, {
      projectId: p.projectId,
      proposalId: proposals[0],
      version: 1,
    });

  it("is neither revised nor settled while its round is a draft or open", async () => {
    const { roundId } = ok(await add(p.facilitator, proposals[0]));
    expect(await revise()).toEqual({ ok: false, error: "detail_in_value_round" });
    expect(await settle()).toEqual({ ok: false, error: "detail_in_value_round" });
    ok(await openRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(await revise()).toEqual({ ok: false, error: "detail_in_value_round" });
    expect(await settle()).toEqual({ ok: false, error: "detail_in_value_round" });
  });

  it("is free again once the round is closed or the list is taken out", async () => {
    const { roundId } = ok(await add(p.facilitator, proposals[0]));
    ok(
      await removeValueList(db, p.facilitator, {
        projectId: p.projectId,
        roundId,
        proposalId: proposals[0],
      }),
    );
    expect((await revise()).ok).toBe(true);
  });
});

describe("the details board and the facilitator's view (DT3)", () => {
  it("shows the facilitator a draft and what can start, and a participant no draft", async () => {
    const draft = ok(await add(p.facilitator, proposals[0]));
    const forFacilitator = await detailBoard(db, p.facilitator, p.projectId);
    if (!forFacilitator.ok) throw new Error(forFacilitator.error);
    expect(forFacilitator.value.valueRounds).toEqual({
      mayStart: true,
      draft: { id: draft.roundId, number: 2 },
    });
    expect(forFacilitator.value.elements.find((e) => e.id === p.elements[0])?.valueRound).toEqual({
      id: draft.roundId,
      number: 2,
      status: "draft",
      version: 1,
      appliedVersion: null,
    });
    ok(
      await openRound(db, p.facilitator, { projectId: p.projectId, roundId: draft.roundId }, now()),
    );
    const open = await detailBoard(db, p.facilitator, p.projectId);
    if (!open.ok) throw new Error(open.error);
    expect(open.value.valueRounds).toEqual({ mayStart: false, draft: null });
  });

  it("hides a draft from a participant who reads the board", async () => {
    const architect = p.raters.a1;
    await add(p.facilitator, proposals[0]);
    const board = await detailBoard(db, architect, p.projectId);
    if (!board.ok) throw new Error(board.error);
    expect(board.value.valueRounds).toBeNull();
    expect(board.value.elements.every((element) => element.valueRound === null)).toBe(true);
  });
});

describe("anonymity of value ratings (DE4, Q-ANON-1)", () => {
  const members = (): ProjectMembers => ({
    projectId: p.projectId,
    facilitator: p.facilitator,
    participant: p.raters.n1,
    otherParticipant: p.raters.n2,
    outsider: p.outsider,
    memberIds: [],
  });

  it("names no person in what a participant reads, and no member or rater code in the results", async () => {
    const roundId = await closedValueRound();
    const mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    const results = ok(
      await roundResults(db, p.raters.n1, { projectId: p.projectId, roundId }, now()),
    );
    expect(personLeaks(mine, members())).toEqual([]);
    expect(personLeaks(results, members())).toEqual([]);
    const code = await db.selectFrom("rating_code").select("id").execute();
    for (const row of code) {
      expect(JSON.stringify([mine, results])).not.toContain(row.id);
    }
  });

  it("keeps who rated what from the facilitator unless the round says so", async () => {
    const roundId = await openValueRound();
    await rateSeverity(roundId);
    expect(
      await ratingsByParticipant(db, p.facilitator, { projectId: p.projectId, roundId }),
    ).toEqual({ ok: false, error: "raters_hidden" });
  });

  it("lists the value ratings by participant when the setting is on", async () => {
    const roundId = await draftRound();
    ok(
      await updateRound(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId, facilitatorSeesRaters: true },
        now(),
      ),
    );
    ok(await openRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    const ids = await valueIds(roundId);
    ok(await rate(p.raters.n1, roundId, ids.get("Mild") as string, 7));
    const byRater = ok(
      await ratingsByParticipant(db, p.facilitator, { projectId: p.projectId, roundId }),
    );
    expect(byRater.find((rater) => rater.ratings.length > 0)?.ratings).toEqual([
      { elementId: ids.get("Mild"), score: 7, reason: null },
    ]);
  });
});

describe("the database guards value rounds (DT3)", () => {
  it("refuses an element in a value round, a value list in an element round and a changed kind", async () => {
    const roundId = await draftRound();
    await expect(
      db
        .transaction()
        .execute((trx) =>
          trx
            .insertInto("round_element")
            .values({ round_id: roundId, element_id: p.elements[0] })
            .execute(),
        ),
    ).rejects.toThrow(/round_item_kind/);
    const element = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(3) }, now()),
    );
    await expect(
      db
        .transaction()
        .execute((trx) =>
          trx
            .insertInto("round_value_list")
            .values({ round_id: element.roundId, proposal_id: proposals[0], version: 1 })
            .execute(),
        ),
    ).rejects.toThrow(/round_item_kind/);
    await expect(
      db
        .transaction()
        .execute((trx) =>
          trx.updateTable("round").set({ kind: "elements" }).where("id", "=", roundId).execute(),
        ),
    ).rejects.toThrow(/round_kind_fixed/);
    await expect(
      db
        .transaction()
        .execute((trx) => sql`update round set kind = 'other' where id = ${roundId}`.execute(trx)),
    ).rejects.toThrow();
  });

  it("takes no value rating once the round is closed", async () => {
    const roundId = await closedValueRound();
    const ids = await valueIds(roundId);
    const code = await db.selectFrom("rating_code").select("id").executeTakeFirstOrThrow();
    await expect(
      db.transaction().execute((trx) =>
        trx
          .insertInto("value_rating")
          .values({
            round_id: roundId,
            value_id: ids.get("Mild") as string,
            rating_code_id: code.id,
            score: 5,
          })
          .onConflict((oc) =>
            oc.columns(["round_id", "value_id", "rating_code_id"]).doUpdateSet({ score: 5 }),
          )
          .execute(),
      ),
    ).rejects.toThrow();
  });
});
