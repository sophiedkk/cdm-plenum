// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The rules the database holds itself (docs/architecture.md#data): cardinality and data type
// checks, the round lock of DE2, the opening snapshot of DE12, and the rating trigger of DE3.
import { type Kysely, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "./schema.gen.ts";
import { createTestDb } from "./test-db.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

/** Runs `work` in a savepoint and expects the database to refuse it with `message`. */
async function expectRefused(work: (trx: Kysely<DB>) => Promise<unknown>, message: RegExp) {
  await expect(db.transaction().execute(work)).rejects.toThrow(message);
}

async function project(id = "org-1") {
  await db
    .insertInto("organization")
    .values({ id, name: "Blood pressure", slug: id, createdAt: new Date() })
    .execute();
  await db.insertInto("project").values({ id }).execute();
  return id;
}

async function member(projectId: string, suffix: string) {
  const userId = `user-${suffix}`;
  await db
    .insertInto("user")
    .values({
      id: userId,
      name: "Test Person",
      email: `${suffix}@example.test`,
      emailVerified: true,
    })
    .execute();
  const memberId = `member-${suffix}`;
  await db
    .insertInto("member")
    .values({
      id: memberId,
      organizationId: projectId,
      userId,
      role: "participant",
      createdAt: new Date(),
    })
    .execute();
  const code = await db
    .insertInto("rating_code")
    .values({ project_id: projectId, member_id: memberId })
    .returning("id")
    .executeTakeFirstOrThrow();
  return code.id;
}

async function element(projectId: string, name = "Systolic") {
  const row = await db
    .insertInto("element")
    .values({ project_id: projectId, name })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** The opening snapshot of a round whose panel met the minimum (DE12). */
const FULL_PANEL = {
  panel_clinical: 2,
  minimum_clinical: 2,
  panel_terminology: 1,
  minimum_terminology: 1,
  panel_architecture: 2,
  minimum_architecture: 2,
};

async function round(projectId: string, opened: boolean) {
  const row = await db
    .insertInto("round")
    .values({
      project_id: projectId,
      number: 1,
      closes_at: new Date(Date.now() + 86_400_000),
      ...(opened ? { opened_at: new Date(), ...FULL_PANEL } : {}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("element", () => {
  it("accepts a known data type and the cardinalities 0..1, 1..* and 1..3", async () => {
    const p = await project();
    for (const [min, max] of [
      [0, 1],
      [1, null],
      [1, 3],
    ] as const) {
      await db
        .insertInto("element")
        .values({
          project_id: p,
          name: "Systolic",
          data_type: "quantity",
          min_occurs: min,
          max_occurs: max,
        })
        .execute();
    }
  });

  it("refuses an unknown data type", async () => {
    const p = await project();
    await expectRefused(
      (trx) =>
        trx
          .insertInto("element")
          .values({ project_id: p, name: "X", data_type: "DV_TEXT" })
          .execute(),
      /element_data_type_check/,
    );
  });

  it("refuses a minimum of 2, a maximum below the minimum and a maximum without a minimum", async () => {
    const p = await project();
    for (const [min, max] of [
      [2, 3],
      [1, 0],
      [null, 1],
    ] as const) {
      await expectRefused(
        (trx) =>
          trx
            .insertInto("element")
            .values({ project_id: p, name: "X", min_occurs: min, max_occurs: max })
            .execute(),
        /element_cardinality_check/,
      );
    }
  });

  it("refuses a blank name", async () => {
    const p = await project();
    await expectRefused(
      (trx) => trx.insertInto("element").values({ project_id: p, name: "  " }).execute(),
      /element_name_check/,
    );
  });

  it("holds units only for a quantity or a quantity interval, as UCUM-shaped codes (DT1)", async () => {
    const p = await project();
    for (const dataType of ["quantity", "quantity_interval"] as const) {
      await db
        .insertInto("element")
        .values({ project_id: p, name: dataType, data_type: dataType, units: ["mm[Hg]", "/min"] })
        .execute();
    }
    const refused = [
      { data_type: "count", units: ["kPa"] },
      { data_type: null, units: ["kPa"] },
      { data_type: "quantity", units: ["mm Hg"] },
      { data_type: "quantity", units: [""] },
      { data_type: "quantity", units: ["µg"] },
      { data_type: "quantity", units: ["a".repeat(41)] },
      { data_type: "quantity", units: Array.from({ length: 11 }, (_, index) => `u${index}`) },
    ] as const;
    for (const row of refused) {
      await expectRefused(
        (trx) =>
          trx
            .insertInto("element")
            .values({ project_id: p, name: "X", data_type: row.data_type, units: [...row.units] })
            .execute(),
        /element_units_check/,
      );
    }
  });
});

describe("detail_proposal units", () => {
  it("holds units only for a quantity or a quantity interval (DT1)", async () => {
    const p = await project();
    const element = await db
      .insertInto("element")
      .values({ project_id: p, name: "Systolic" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("detail_proposal")
      .values({ element_id: element.id, data_type: "quantity", units: ["kPa"] })
      .execute();
    await expectRefused(
      (trx) =>
        trx
          .updateTable("detail_proposal")
          .set({ data_type: "coded_text" })
          .where("element_id", "=", element.id)
          .execute(),
      /detail_proposal_units_check/,
    );
    await expectRefused(
      (trx) =>
        trx
          .updateTable("detail_proposal")
          .set({ units: ["kPa", "bad unit"] })
          .where("element_id", "=", element.id)
          .execute(),
      /detail_proposal_units_check/,
    );
  });
});

describe("round", () => {
  it("lets the facilitator change the rule before the round opens", async () => {
    const r = await round(await project(), false);
    await db.updateTable("round").set({ agreement_pct: "80" }).where("id", "=", r).execute();
  });

  it("refuses a change to the rule, the closing date or the rater setting once open (DE2)", async () => {
    const r = await round(await project(), true);
    for (const change of [
      { agreement_pct: "60" },
      { closes_at: new Date(Date.now() + 2 * 86_400_000) },
      { facilitator_sees_raters: true },
    ]) {
      await expectRefused(
        (trx) => trx.updateTable("round").set(change).where("id", "=", r).execute(),
        /round_rule_locked/,
      );
    }
  });

  it("still lets an open round close", async () => {
    const r = await round(await project(), true);
    await db.updateTable("round").set({ closed_at: new Date() }).where("id", "=", r).execute();
  });

  it("refuses a change to the opening snapshot once open (DE12)", async () => {
    const r = await round(await project(), true);
    for (const change of [
      { panel_clinical: 3 },
      { minimum_architecture: 1 },
      { below_minimum_reason: "Teaching group" },
    ]) {
      await expectRefused(
        (trx) => trx.updateTable("round").set(change).where("id", "=", r).execute(),
        /round_rule_locked/,
      );
    }
  });

  it("refuses an open round without its panel snapshot, and a draft with one", async () => {
    const p = await project();
    const closes_at = new Date(Date.now() + 86_400_000);
    await expectRefused(
      (trx) =>
        trx
          .insertInto("round")
          .values({ project_id: p, number: 1, closes_at, opened_at: new Date() })
          .execute(),
      /round_panel_snapshot_check/,
    );
    await expectRefused(
      (trx) =>
        trx
          .insertInto("round")
          .values({ project_id: p, number: 1, closes_at, ...FULL_PANEL })
          .execute(),
      /round_panel_snapshot_check/,
    );
  });

  it("holds a reason exactly when the panel was below the minimum (DE12)", async () => {
    const p = await project();
    const values = { project_id: p, closes_at: new Date(), opened_at: new Date() };
    const below = { ...FULL_PANEL, panel_terminology: 0 };
    for (const [number, snapshot] of [
      [1, { ...below }],
      [2, { ...below, below_minimum_reason: "  " }],
      [3, { ...FULL_PANEL, below_minimum_reason: "Not needed" }],
    ] as const) {
      await expectRefused(
        (trx) =>
          trx
            .insertInto("round")
            .values({ ...values, number, ...snapshot })
            .execute(),
        /round_panel_snapshot_check/,
      );
    }
    await db
      .insertInto("round")
      .values({ ...values, number: 4, ...below, below_minimum_reason: "Teaching group" })
      .execute();
  });

  it("refuses a negative panel count", async () => {
    const p = await project();
    await expectRefused(
      (trx) =>
        trx
          .insertInto("round")
          .values({
            project_id: p,
            number: 1,
            closes_at: new Date(),
            opened_at: new Date(),
            ...FULL_PANEL,
            panel_clinical: -1,
            below_minimum_reason: "x",
          })
          .execute(),
      /round_panel_clinical_check/,
    );
  });

  it("refuses bands that overlap", async () => {
    const p = await project();
    await expectRefused(
      (trx) =>
        trx
          .insertInto("round")
          .values({
            project_id: p,
            number: 1,
            closes_at: new Date(),
            bottom_band_max: 7,
            top_band_min: 7,
          })
          .execute(),
      /round_scale_check/,
    );
  });
});

describe("project panel (DE11, DE13)", () => {
  it("starts as change class D and refuses a class outside A to D", async () => {
    const p = await project();
    const row = await db
      .selectFrom("project")
      .select("change_class")
      .where("id", "=", p)
      .executeTakeFirstOrThrow();
    expect(row.change_class).toBe("D");
    await expectRefused(
      (trx) => trx.updateTable("project").set({ change_class: "E" }).where("id", "=", p).execute(),
      /project_change_class_check/,
    );
  });

  it("refuses an unknown expert type and a negative minimum", async () => {
    const p = await project();
    await expectRefused(
      (trx) =>
        trx
          .insertInto("project_panel_minimum")
          .values({ project_id: p, expert_type: "billing", minimum: 1 })
          .execute(),
      /project_panel_minimum_expert_type_check/,
    );
    await expectRefused(
      (trx) =>
        trx
          .insertInto("project_panel_minimum")
          .values({ project_id: p, expert_type: "clinical", minimum: -1 })
          .execute(),
      /project_panel_minimum_minimum_check/,
    );
  });
});

describe("rating", () => {
  async function setup(opened: boolean) {
    const p = await project();
    const code = await member(p, "a");
    const e = await element(p);
    const r = await round(p, opened);
    await db.insertInto("round_element").values({ round_id: r, element_id: e }).execute();
    return { p, code, e, r };
  }

  it('accepts a score inside the scale and "unable to rate" in an open round', async () => {
    const { code, e, r } = await setup(true);
    await db
      .insertInto("rating")
      .values({ round_id: r, element_id: e, rating_code_id: code, score: 9 })
      .execute();
    await db
      .updateTable("rating")
      .set({ score: null, reason: "Outside my practice" })
      .where("rating_code_id", "=", code)
      .execute();
  });

  it("refuses a rating in a round that is not open", async () => {
    const { code, e, r } = await setup(false);
    await expectRefused(
      (trx) =>
        trx
          .insertInto("rating")
          .values({ round_id: r, element_id: e, rating_code_id: code, score: 5 })
          .execute(),
      /rating_round_not_open/,
    );
  });

  it("refuses a rating in a closed round", async () => {
    const { code, e, r } = await setup(true);
    await db.updateTable("round").set({ closed_at: new Date() }).where("id", "=", r).execute();
    await expectRefused(
      (trx) =>
        trx
          .insertInto("rating")
          .values({ round_id: r, element_id: e, rating_code_id: code, score: 5 })
          .execute(),
      /rating_round_not_open/,
    );
  });

  it("refuses a score outside the round's scale", async () => {
    const { code, e, r } = await setup(true);
    await expectRefused(
      (trx) =>
        trx
          .insertInto("rating")
          .values({ round_id: r, element_id: e, rating_code_id: code, score: 10 })
          .execute(),
      /rating_score_out_of_scale/,
    );
  });

  it("refuses a rating code of another project", async () => {
    const { e, r } = await setup(true);
    const other = await project("org-2");
    const foreignCode = await member(other, "b");
    await expectRefused(
      (trx) =>
        trx
          .insertInto("rating")
          .values({ round_id: r, element_id: e, rating_code_id: foreignCode, score: 5 })
          .execute(),
      /rating_code_wrong_project/,
    );
  });
});

describe("rating_code", () => {
  it("is a random version 4 UUID, so it reveals no join order (ADR 0005)", async () => {
    const code = await member(await project(), "a");
    const { rows } = await sql<{
      version: number;
    }>`select uuid_extract_version(${code}::uuid) as version`.execute(db);
    expect(rows[0]?.version).toBe(4);
  });
});

describe("round proposals (DE16)", () => {
  async function secondRound(projectId: string, opened = true) {
    const row = await db
      .insertInto("round")
      .values({
        project_id: projectId,
        number: 2,
        closes_at: new Date(Date.now() + 86_400_000),
        ...(opened ? { opened_at: new Date(), ...FULL_PANEL } : {}),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  it("lets the facilitator change the proposal rule before round 1 opens", async () => {
    const r = await round(await project(), false);
    await db
      .updateTable("round")
      .set({ proposal_rule: "Proposed by at least three participants" })
      .where("id", "=", r)
      .execute();
  });

  it("refuses a change to the proposal rule once the round is open (DE2)", async () => {
    const r = await round(await project(), false);
    await db
      .updateTable("round")
      .set({ proposal_rule: "Proposed by at least two participants" })
      .where("id", "=", r)
      .execute();
    await db
      .updateTable("round")
      .set({ opened_at: new Date(), ...FULL_PANEL })
      .where("id", "=", r)
      .execute();
    for (const proposal_rule of ["Proposed by one participant", null]) {
      await expectRefused(
        (trx) => trx.updateTable("round").set({ proposal_rule }).where("id", "=", r).execute(),
        /round_rule_locked/,
      );
    }
  });

  it("refuses a proposal rule on a later round, a blank one and one that is too long", async () => {
    const p = await project();
    const r2 = await secondRound(p, false);
    const r1 = await round(p, false);
    await expectRefused(
      (trx) =>
        trx
          .updateTable("round")
          .set({ proposal_rule: "Proposed by at least two participants" })
          .where("id", "=", r2)
          .execute(),
      /round_proposal_rule_check/,
    );
    for (const proposal_rule of ["  ", "x".repeat(501)]) {
      await expectRefused(
        (trx) => trx.updateTable("round").set({ proposal_rule }).where("id", "=", r1).execute(),
        /round_proposal_rule_check/,
      );
    }
    await expectRefused(
      (trx) =>
        trx
          .insertInto("round")
          .values({
            project_id: p,
            number: 3,
            closes_at: new Date(Date.now() + 86_400_000),
            proposal_rule: "Proposed by at least two participants",
          })
          .execute(),
      /round_proposal_rule_check/,
    );
  });

  it("takes a proposal in an open round 1 only, from a code of the round's project", async () => {
    const p = await project();
    const code = await member(p, "a");
    const first = await round(p, false);
    const later = await secondRound(p);
    const values = (round_id: string, rating_code_id = code) => ({
      round_id,
      rating_code_id,
      name: "Body position",
    });
    await expectRefused(
      (trx) => trx.insertInto("round_proposal").values(values(first)).execute(),
      /proposal_round_not_open/,
    );
    await expectRefused(
      (trx) => trx.insertInto("round_proposal").values(values(later)).execute(),
      /proposal_not_first_round/,
    );
    await db
      .updateTable("round")
      .set({ opened_at: new Date(), ...FULL_PANEL })
      .where("id", "=", first)
      .execute();
    await db.insertInto("round_proposal").values(values(first)).execute();
    const foreignCode = await member(await project("org-2"), "b");
    await expectRefused(
      (trx) => trx.insertInto("round_proposal").values(values(first, foreignCode)).execute(),
      /proposal_code_wrong_project/,
    );
    await db.updateTable("round").set({ closed_at: new Date() }).where("id", "=", first).execute();
    await expectRefused(
      (trx) => trx.insertInto("round_proposal").values(values(first)).execute(),
      /proposal_round_not_open/,
    );
  });

  it("refuses a blank proposal name", async () => {
    const p = await project();
    const code = await member(p, "a");
    const r = await round(p, true);
    await expectRefused(
      (trx) =>
        trx
          .insertInto("round_proposal")
          .values({ round_id: r, rating_code_id: code, name: " " })
          .execute(),
      /round_proposal_name_check/,
    );
  });

  it("allows a delphi source on an element and no unknown kind", async () => {
    const e = await element(await project());
    await db
      .insertInto("element_source")
      .values({ element_id: e, kind: "delphi", label: "1" })
      .execute();
    await expectRefused(
      (trx) =>
        trx
          .insertInto("element_source")
          .values({ element_id: e, kind: "survey", label: "1" })
          .execute(),
      /element_source_kind_check/,
    );
  });
});

describe("the order of elements in the tree (DT6, #99)", () => {
  it("holds a place of 0 or more on an element, and none outside a settled tree", async () => {
    const p = await project();
    const row = await db
      .insertInto("element")
      .values({ project_id: p, name: "Systolic", tree_position: 0 })
      .returning(["id", "tree_position"])
      .executeTakeFirstOrThrow();
    expect(row.tree_position).toBe(0);
    const loose = await db
      .insertInto("element")
      .values({ project_id: p, name: "Loose" })
      .returning("tree_position")
      .executeTakeFirstOrThrow();
    expect(loose.tree_position).toBeNull();
    await expectRefused(
      (trx) =>
        trx.updateTable("element").set({ tree_position: -1 }).where("id", "=", row.id).execute(),
      /element_tree_position_check/,
    );
  });

  it("requires a place of 0 or more on a proposed element", async () => {
    const p = await project();
    const element = await db
      .insertInto("element")
      .values({ project_id: p, name: "Systolic" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const proposal = await db
      .insertInto("detail_proposal")
      .values({ kind: "tree", project_id: p })
      .returning("id")
      .executeTakeFirstOrThrow();
    const values = { proposal_id: proposal.id, element_id: element.id, registration: false };
    await expectRefused(
      (trx) =>
        trx
          .insertInto("tree_proposal_element")
          .values({ ...values, position: undefined as unknown as number })
          .execute(),
      /null value in column "position"/,
    );
    await expectRefused(
      (trx) =>
        trx
          .insertInto("tree_proposal_element")
          .values({ ...values, position: -1 })
          .execute(),
      /tree_proposal_element_position_check/,
    );
    await db
      .insertInto("tree_proposal_element")
      .values({ ...values, position: 0 })
      .execute();
  });
});
