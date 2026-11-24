// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A reference element in a round on real PostgreSQL (EL26, ADR 0021): it is rated like any
// element, and the rating card, the round and its results name the model it refers to.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { getRound } from "./queries.ts";
import { myRatings, saveRating } from "./ratings.ts";
import { roundResults } from "./results.ts";
import { closedNow, ok, openedRound, type PanelProject, panelProject } from "./test-round.ts";

let db: Kysely<DB>;
let p: PanelProject;

const ZIB = { title: "Zib Bloeddruk", url: "https://models.example.test/zib/bloeddruk" };
const now = () => ({ now: new Date() });

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db);
  await db
    .updateTable("element")
    .set({ kind: "reference", reference_title: ZIB.title, reference_url: ZIB.url })
    .where("id", "=", p.elements[0])
    .execute();
});

afterEach(async () => {
  await db.destroy();
});

describe("a reference in a round (EL26)", () => {
  it("names the model on the rating card, the round and the results, and is rated as usual", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const input = { projectId: p.projectId, roundId };
    const mine = ok(await myRatings(db, p.raters.n1, input, now()));
    const byId = new Map(mine.elements.map((element) => [element.id, element]));
    expect(byId.get(p.elements[0])?.reference).toEqual(ZIB);
    expect(byId.get(p.elements[1])?.reference).toBeNull();
    const round = ok(await getRound(db, p.raters.n1, input, now()));
    expect(round.elements.find((element) => element.id === p.elements[0])?.reference).toEqual(ZIB);

    for (const rater of Object.values(p.raters)) {
      ok(await saveRating(db, rater, { ...input, elementId: p.elements[0], score: 9 }));
    }
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const results = ok(await roundResults(db, p.raters.n1, input, now()));
    expect(results.elements.find((element) => element.id === p.elements[0])?.reference).toEqual(
      ZIB,
    );
  });
});
