// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Proposals for missing elements in round 1 (DE16) on real PostgreSQL: the rule and its lock,
// proposing and deleting while the round is open, the refusals, adding a proposal to the board,
// and the anonymity of proposals (ADR 0005, DE4, Q-ANON-1).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { listElements, listElementsWithAuthors } from "../elements/queries.ts";
import { setRaterGroup } from "../projects/queries.ts";
import { groupId } from "../test-fixtures.ts";
import {
  addProposal,
  addProposalToBoard,
  deleteProposal,
  myProposals,
  roundProposals,
} from "./proposals.ts";
import { createRound, getRound, listRounds, openRound, updateRound } from "./queries.ts";
import { myRatings, ratingsByParticipant } from "./ratings.ts";
import { roundResults } from "./results.ts";
import {
  closedNow,
  inDays,
  ok,
  openedRound,
  type PanelProject,
  panelProject,
} from "./test-round.ts";

let db: Kysely<DB>;
let p: PanelProject;
const now = () => ({ now: new Date() });
const RULE = "Proposed by at least two participants";

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db);
});

afterEach(async () => {
  await db.destroy();
});

/** The value of a project action that must succeed. */
function must<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

function propose(userId: string, roundId: string, name: string, description = "") {
  return addProposal(db, userId, { projectId: p.projectId, roundId, name, description });
}

async function actions() {
  const rows = await db
    .selectFrom("activity_log")
    .select(["action", "target_type"])
    .where("action", "like", "proposal%")
    .orderBy("id")
    .execute();
  return rows.map((row) => `${row.action} ${row.target_type}`);
}

describe("the proposal rule (DE16, DE2)", () => {
  it("is set on round 1, changes in draft and is locked once the round opens", async () => {
    const created = ok(
      await createRound(
        db,
        p.facilitator,
        { projectId: p.projectId, closesAt: inDays(1), proposalRule: `  ${RULE} ` },
        now(),
      ),
    );
    const input = { projectId: p.projectId, roundId: created.roundId };
    expect(ok(await getRound(db, p.facilitator, input, now())).proposalRule).toBe(RULE);
    ok(await updateRound(db, p.facilitator, { ...input, proposalRule: "" }, now()));
    expect(ok(await getRound(db, p.facilitator, input, now())).proposalRule).toBeNull();
    ok(await updateRound(db, p.facilitator, { ...input, proposalRule: RULE }, now()));
    ok(await openRound(db, p.facilitator, input, now()));
    expect(
      await updateRound(db, p.facilitator, { ...input, proposalRule: "Any proposal" }, now()),
    ).toEqual({ ok: false, error: "round_not_draft" });
    // Participants see the rule before they propose.
    expect(ok(await getRound(db, p.raters.n1, input, now())).proposalRule).toBe(RULE);
    await expect(
      db
        .updateTable("round")
        .set({ proposal_rule: null })
        .where("id", "=", input.roundId)
        .execute(),
    ).rejects.toThrow(/round_rule_locked/);
  });

  it("refuses a rule on a later round, when created and when changed", async () => {
    const first = await openedRound(db, p.facilitator, p.projectId);
    await closedNow(db, p.facilitator, p.projectId, first);
    expect(
      await createRound(
        db,
        p.facilitator,
        { projectId: p.projectId, closesAt: inDays(1), proposalRule: RULE },
        now(),
      ),
    ).toEqual({ ok: false, error: "proposals_first_round_only" });
    const second = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(1) }, now()),
    );
    const input = { projectId: p.projectId, roundId: second.roundId };
    expect(await updateRound(db, p.facilitator, { ...input, proposalRule: RULE }, now())).toEqual({
      ok: false,
      error: "proposals_first_round_only",
    });
    // A blank rule is no rule, so a later round may send one.
    ok(await updateRound(db, p.facilitator, { ...input, proposalRule: " " }, now()));
  });
});

describe("proposing in round 1 (DE16)", () => {
  it("lets a participant add several proposals and delete their own while the round is open", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const input = { projectId: p.projectId, roundId };
    const first = ok(await propose(p.raters.n1, roundId, "Body position", "Lying, sitting"));
    ok(await propose(p.raters.n1, roundId, "Cuff location"));
    expect(ok(await myProposals(db, p.raters.n1, input))).toEqual([
      { id: first.proposalId, name: "Body position", description: "Lying, sitting" },
      { id: expect.any(String), name: "Cuff location", description: "" },
    ]);
    expect(
      await deleteProposal(db, p.raters.n1, { ...input, proposalId: first.proposalId }),
    ).toEqual({ ok: true, value: null });
    expect(ok(await myProposals(db, p.raters.n1, input)).map((x) => x.name)).toEqual([
      "Cuff location",
    ]);
    // The log names the round only: never what was proposed (Q-PRIV-2).
    expect(await actions()).toEqual([
      "proposal_added round",
      "proposal_added round",
      "proposal_deleted round",
    ]);
  });

  it("refuses to add or delete after the round closes", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const proposed = ok(await propose(p.raters.n1, roundId, "Body position"));
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await propose(p.raters.n1, roundId, "Cuff location")).toEqual({
      ok: false,
      error: "round_not_open",
    });
    const input = { projectId: p.projectId, roundId, proposalId: proposed.proposalId };
    expect(await deleteProposal(db, p.raters.n1, input)).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(
      ok(await myProposals(db, p.raters.n1, { projectId: p.projectId, roundId })),
    ).toHaveLength(1);
  });

  it("refuses to add after the closing date, before the facilitator closes", async () => {
    // Inserted directly, opened two days ago: the service never opens a round that is past due.
    const { id: roundId } = await db
      .insertInto("round")
      .values({
        project_id: p.projectId,
        number: 1,
        closes_at: inDays(-1),
        opened_at: inDays(-2),
        panel_clinical: 2,
        minimum_clinical: 2,
        panel_terminology: 1,
        minimum_terminology: 1,
        panel_architecture: 2,
        minimum_architecture: 2,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    expect(await propose(p.raters.n1, roundId, "Body position")).toEqual({
      ok: false,
      error: "round_not_open",
    });
  });

  it("refuses proposals in a later round", async () => {
    const first = await openedRound(db, p.facilitator, p.projectId);
    const proposed = ok(await propose(p.raters.n1, first, "Body position"));
    await closedNow(db, p.facilitator, p.projectId, first);
    const second = await openedRound(db, p.facilitator, p.projectId);
    expect(await propose(p.raters.n1, second, "Cuff location")).toEqual({
      ok: false,
      error: "proposals_first_round_only",
    });
    expect(
      await deleteProposal(db, p.raters.n1, {
        projectId: p.projectId,
        roundId: second,
        proposalId: proposed.proposalId,
      }),
    ).toEqual({ ok: false, error: "proposals_first_round_only" });
  });

  it("refuses to delete another participant's proposal and keeps it", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const theirs = ok(await propose(p.raters.n2, roundId, "Body position"));
    const input = { projectId: p.projectId, roundId, proposalId: theirs.proposalId };
    expect(await deleteProposal(db, p.raters.n1, input)).toEqual({
      ok: false,
      error: "proposal_not_found",
    });
    expect(await deleteProposal(db, p.facilitator, input)).toEqual({
      ok: false,
      error: "rater_group_required",
    });
    expect(ok(await roundProposals(db, p.facilitator, input)).map((x) => x.name)).toEqual([
      "Body position",
    ]);
  });

  it("refuses a draft round, a non-member and a facilitator outside a group", async () => {
    const { roundId } = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(1) }, now()),
    );
    expect(await propose(p.raters.n1, roundId, "Body position")).toEqual({
      ok: false,
      error: "round_not_found",
    });
    ok(await openRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(await propose(p.outsider, roundId, "Body position")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await propose(p.facilitator, roundId, "Body position")).toEqual({
      ok: false,
      error: "rater_group_required",
    });
    const group = await groupId(db, p.projectId, "Nursing");
    must(await setRaterGroup(db, p.facilitator, { projectId: p.projectId, groupId: group }));
    expect((await propose(p.facilitator, roundId, "Body position")).ok).toBe(true);
  });
});

describe("adding a proposal to the board (DE16)", () => {
  it("creates an element with a round 1 source, once, and logs it", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const proposed = ok(await propose(p.raters.n1, roundId, "Body position", "Lying or sitting"));
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const input = { projectId: p.projectId, roundId, proposalId: proposed.proposalId };
    const { elementId } = ok(await addProposalToBoard(db, p.facilitator, input));
    const board = must(await listElements(db, p.raters.n2, p.projectId));
    const added = board.find((element) => element.id === elementId);
    expect(added).toMatchObject({
      name: "Body position",
      description: "Lying or sitting",
      sources: [{ kind: "delphi", label: "1" }],
    });
    expect(ok(await roundProposals(db, p.facilitator, input))).toEqual([
      {
        id: proposed.proposalId,
        name: "Body position",
        description: "Lying or sitting",
        elementId,
      },
    ]);
    // The facilitator is the author on the board, never the proposer (ADR 0005).
    const withAuthors = must(await listElementsWithAuthors(db, p.facilitator, p.projectId));
    const facilitatorMember = await db
      .selectFrom("member")
      .select("id")
      .where("organizationId", "=", p.projectId)
      .where("userId", "=", p.facilitator)
      .executeTakeFirstOrThrow();
    expect(withAuthors.find((element) => element.id === elementId)?.author?.memberId).toBe(
      facilitatorMember.id,
    );
    expect(await addProposalToBoard(db, p.facilitator, input)).toEqual({
      ok: false,
      error: "proposal_already_on_board",
    });
    const logged = await db
      .selectFrom("activity_log")
      .select(["target_type", "target_id"])
      .where("action", "=", "proposal_added_to_board")
      .execute();
    expect(logged).toEqual([{ target_type: "element", target_id: elementId }]);
  });

  it("refuses a participant, a non-member and an unknown proposal", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const proposed = ok(await propose(p.raters.n1, roundId, "Body position"));
    const input = { projectId: p.projectId, roundId, proposalId: proposed.proposalId };
    expect(await addProposalToBoard(db, p.raters.n1, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await addProposalToBoard(db, p.outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await roundProposals(db, p.raters.n1, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(
      await addProposalToBoard(db, p.facilitator, {
        ...input,
        proposalId: "00000000-0000-4000-8000-000000000000",
      }),
    ).toEqual({ ok: false, error: "proposal_not_found" });
    expect(must(await listElements(db, p.raters.n1, p.projectId))).toHaveLength(3);
  });
});

describe("anonymity of proposals (ADR 0005, DE4, Q-ANON-1)", () => {
  /** Every id, address and name that would link a proposal to a person. */
  async function identifiers(): Promise<string[]> {
    const members = await db
      .selectFrom("member")
      .innerJoin("user", "user.id", "member.userId")
      .select(["member.id as memberId", "user.id as userId", "user.email", "user.name"])
      .where("member.organizationId", "=", p.projectId)
      .execute();
    const codes = await db.selectFrom("round_proposal").select("rating_code_id").execute();
    return [
      ...members.flatMap((m) => [m.memberId, m.userId, m.email, m.name]),
      ...codes.map((c) => c.rating_code_id),
    ].filter((value) => value !== "");
  }

  beforeEach(async () => {
    for (const [name, userId] of Object.entries(p.raters)) {
      await db
        .updateTable("user")
        .set({ name: `Invented Rater ${name}` })
        .where("id", "=", userId)
        .execute();
    }
  });

  it("never shows a participant another participant's proposal", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const input = { projectId: p.projectId, roundId };
    ok(await propose(p.raters.n1, roundId, "Own proposal of n1"));
    ok(await propose(p.raters.n2, roundId, "Secret proposal of n2", "Only n2 wrote this"));
    const before = [
      await myProposals(db, p.raters.n1, input),
      await myRatings(db, p.raters.n1, input, now()),
      await getRound(db, p.raters.n1, input, now()),
      await listRounds(db, p.raters.n1, p.projectId, now()),
    ];
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const after = [
      await myProposals(db, p.raters.n1, input),
      await myRatings(db, p.raters.n1, input, now()),
      await getRound(db, p.raters.n1, input, now()),
      await roundResults(db, p.raters.n1, input, now()),
      await roundProposals(db, p.raters.n1, input),
    ];
    const text = JSON.stringify([...before, ...after]);
    expect(text).toContain("Own proposal of n1");
    expect(text).not.toContain("Secret proposal of n2");
    expect(text).not.toContain("Only n2 wrote this");
    expect((await identifiers()).filter((value) => text.includes(value))).toEqual([]);
  });

  it("gives the facilitator no proposer identity while the rater setting is off", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const input = { projectId: p.projectId, roundId };
    for (const [name, userId] of Object.entries(p.raters)) {
      ok(await propose(userId, roundId, `Proposal of ${name}`));
    }
    const listed = ok(await roundProposals(db, p.facilitator, input));
    expect(listed).toHaveLength(5);
    // Alphabetical, so the order does not follow who proposed first.
    expect(listed.map((x) => x.name)).toEqual([...listed.map((x) => x.name)].sort());
    const responses: unknown[] = [listed, await ratingsByParticipant(db, p.facilitator, input)];
    const first = listed[0];
    if (!first) throw new Error("no proposal");
    responses.push(
      await addProposalToBoard(db, p.facilitator, { ...input, proposalId: first.id }),
      await listElements(db, p.facilitator, p.projectId),
    );
    expect(responses[1]).toEqual({ ok: false, error: "raters_hidden" });
    const text = JSON.stringify(responses);
    const forbidden = await identifiers();
    expect(forbidden.length).toBeGreaterThan(15);
    expect(forbidden.filter((value) => text.includes(value))).toEqual([]);
  });

  it("shows the facilitator who proposed what when the round allows it", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      facilitatorSeesRaters: true,
    });
    const input = { projectId: p.projectId, roundId };
    const proposed = ok(await propose(p.raters.t1, roundId, "Body position"));
    const participants = ok(await ratingsByParticipant(db, p.facilitator, input));
    expect(participants).toEqual([
      expect.objectContaining({
        name: "Invented Rater t1",
        ratings: [],
        proposalIds: [proposed.proposalId],
      }),
    ]);
  });
});
