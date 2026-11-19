// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import type { DB } from "./schema.gen.ts";
import {
  DEMO_ELEMENTS,
  DEMO_PARTICIPANTS,
  DEMO_PROJECT_NAME,
  seedDemo,
  seedDemoCommand,
} from "./seed-demo.ts";
import { createTestDb } from "./test-db.ts";

let db: Kysely<DB> | undefined;

afterEach(async () => {
  await db?.destroy();
  db = undefined;
});

describe("seedDemo", () => {
  it("creates the demo project with its panel, board and two rounds", async () => {
    db = await createTestDb();
    const summary = await seedDemo(db, "facilitator@example.test");
    expect(summary.status).toBe("seeded");

    const members = await db
      .selectFrom("member")
      .select("role")
      .where("organizationId", "=", summary.projectId)
      .execute();
    expect(members.filter((m) => m.role === "participant")).toHaveLength(DEMO_PARTICIPANTS.length);
    expect(members.filter((m) => m.role === "facilitator")).toHaveLength(1);

    const elements = await db
      .selectFrom("element")
      .select("id")
      .where("project_id", "=", summary.projectId)
      .execute();
    expect(elements).toHaveLength(DEMO_ELEMENTS.length);

    const rounds = await db
      .selectFrom("round")
      .select(["id", "number", "opened_at", "closed_at"])
      .where("project_id", "=", summary.projectId)
      .orderBy("number")
      .execute();
    expect(rounds.map((r) => [r.number, r.opened_at !== null, r.closed_at !== null])).toEqual([
      [1, true, true],
      [2, true, false],
    ]);

    // Round 1 shows every outcome under the default rule.
    const outcomes = await db
      .selectFrom("round_element")
      .select("outcome")
      .where("round_id", "=", rounds[0]?.id ?? "")
      .execute();
    const counts = Object.fromEntries(
      ["included", "excluded", "no_consensus"].map((o) => [
        o,
        outcomes.filter((r) => r.outcome === o).length,
      ]),
    );
    expect(counts).toEqual({ included: 5, excluded: 1, no_consensus: 2 });

    // Round 2 rates exactly the elements without consensus.
    const round2 = await db
      .selectFrom("round_element")
      .select("element_id")
      .where("round_id", "=", rounds[1]?.id ?? "")
      .execute();
    expect(round2).toHaveLength(2);
  });

  it("changes nothing when the demo project already exists", async () => {
    db = await createTestDb();
    const first = await seedDemo(db, "facilitator@example.test");
    const second = await seedDemo(db, "facilitator@example.test");
    expect(second).toMatchObject({ status: "already_seeded", projectId: first.projectId });
    const projects = await db
      .selectFrom("organization")
      .select("id")
      .where("name", "=", DEMO_PROJECT_NAME)
      .execute();
    expect(projects).toHaveLength(1);
  });

  it("grants the given address the facilitator and administrator rights", async () => {
    db = await createTestDb();
    await seedDemo(db, "Owner@Example.Test");
    const rights = await db
      .selectFrom("app_role")
      .select("role")
      .where("email", "=", "owner@example.test")
      .orderBy("role")
      .execute();
    expect(rights.map((r) => r.role)).toEqual(["administrator", "facilitator"]);
  });
});

describe("seedDemoCommand", () => {
  const never = () => {
    throw new Error("must not connect");
  };

  it("refuses with NODE_ENV=production before connecting", async () => {
    const lines: string[] = [];
    const code = await seedDemoCommand(
      [],
      { NODE_ENV: "production", DATABASE_URL: "postgres://x" },
      (l) => lines.push(l),
      never,
    );
    expect(code).toBe(1);
    expect(lines).toEqual(["seed-demo: refused with NODE_ENV=production"]);
  });

  it("refuses an unknown option with the usage", async () => {
    const lines: string[] = [];
    const code = await seedDemoCommand(
      ["--everything"],
      { DATABASE_URL: "postgres://x" },
      (l) => lines.push(l),
      never,
    );
    expect(code).toBe(2);
    expect(lines[0]).toMatch(/^usage:/);
  });

  it("refuses without DATABASE_URL", async () => {
    const lines: string[] = [];
    const code = await seedDemoCommand([], {}, (l) => lines.push(l), never);
    expect(code).toBe(1);
    expect(lines).toEqual(["Invalid environment configuration: DATABASE_URL"]);
  });
});
