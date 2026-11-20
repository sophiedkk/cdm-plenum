// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT_PHASES, type ProjectPhase } from "@/lib/project-phases";
import { grantAppRole } from "../admin/app-roles.ts";
import { createProject } from "../projects/queries.ts";
import { insertUser } from "../test-fixtures.ts";
import type { DB } from "./schema.gen.ts";
import {
  DEMO_BRAINSTORM,
  DEMO_ELEMENTS,
  DEMO_HANDOFF_ELEMENTS,
  DEMO_PARTICIPANTS,
  DEMO_PROJECTS,
  type SeedSummary,
  seedDemo,
  seedDemoCommand,
} from "./seed-demo.ts";
import { createTestDb } from "./test-db.ts";

let db: Kysely<DB> | undefined;

afterEach(async () => {
  await db?.destroy();
  db = undefined;
});

async function projectOf(summary: SeedSummary, phase: ProjectPhase): Promise<string> {
  const project = summary.projects.find((p) => p.phase === phase);
  if (!project) throw new Error(`no demo project for ${phase}`);
  return project.projectId;
}

async function outcomes(round: { id: string } | undefined): Promise<Record<string, number>> {
  const rows = await (db as Kysely<DB>)
    .selectFrom("round_element")
    .select("outcome")
    .where("round_id", "=", round?.id ?? "")
    .execute();
  return Object.fromEntries(
    ["included", "excluded", "no_consensus"].map((o) => [
      o,
      rows.filter((r) => r.outcome === o).length,
    ]),
  );
}

async function roundsOf(projectId: string) {
  return (db as Kysely<DB>)
    .selectFrom("round")
    .select(["id", "number", "opened_at", "closed_at"])
    .where("project_id", "=", projectId)
    .orderBy("number")
    .execute();
}

describe("seedDemo", () => {
  it("creates one demo project per phase, each in its phase", async () => {
    db = await createTestDb();
    const summary = await seedDemo(db, "facilitator@example.test");
    expect(summary.projects.map((p) => [p.phase, p.name, p.status])).toEqual(
      PROJECT_PHASES.map((phase) => [phase, DEMO_PROJECTS[phase], "seeded"]),
    );
    for (const phase of PROJECT_PHASES) {
      const project = await db
        .selectFrom("project")
        .select("phase")
        .where("id", "=", await projectOf(summary, phase))
        .executeTakeFirstOrThrow();
      expect(project.phase).toBe(phase);
      const members = await db
        .selectFrom("member")
        .select("role")
        .where("organizationId", "=", await projectOf(summary, phase))
        .execute();
      expect(members.filter((m) => m.role === "participant")).toHaveLength(
        DEMO_PARTICIPANTS.length,
      );
      expect(members.filter((m) => m.role === "facilitator")).toHaveLength(1);
    }
  });

  it("leaves the scope project with comments and no elements", async () => {
    db = await createTestDb();
    const projectId = await projectOf(await seedDemo(db, "facilitator@example.test"), "scope");
    const comments = await db
      .selectFrom("scope_comment")
      .select("id")
      .where("project_id", "=", projectId)
      .execute();
    expect(comments).toHaveLength(3);
    const elements = await db
      .selectFrom("element")
      .select("id")
      .where("project_id", "=", projectId)
      .execute();
    expect(elements).toHaveLength(0);
  });

  it("leaves the discover project in the private step, with elements of five participants", async () => {
    db = await createTestDb();
    const projectId = await projectOf(await seedDemo(db, "facilitator@example.test"), "discover");
    const project = await db
      .selectFrom("project")
      .select(["private_brainstorm", "board_revealed_at"])
      .where("id", "=", projectId)
      .executeTakeFirstOrThrow();
    expect(project.private_brainstorm).toBe(true);
    expect(project.board_revealed_at).toBeNull();
    const elements = await db
      .selectFrom("element")
      .select(["author_member_id", "prompt"])
      .where("project_id", "=", projectId)
      .execute();
    expect(elements).toHaveLength(DEMO_BRAINSTORM.length);
    expect(new Set(elements.map((e) => e.author_member_id)).size).toBe(5);
    expect(elements.every((e) => e.prompt !== null)).toBe(true);
    expect(await roundsOf(projectId)).toHaveLength(0);
  });

  it("gives the decide project a closed round 1 with every outcome and an open round 2", async () => {
    db = await createTestDb();
    const projectId = await projectOf(await seedDemo(db, "facilitator@example.test"), "decide");
    const elements = await db
      .selectFrom("element")
      .select("id")
      .where("project_id", "=", projectId)
      .execute();
    expect(elements).toHaveLength(DEMO_ELEMENTS.length);
    const rounds = await roundsOf(projectId);
    expect(rounds.map((r) => [r.number, r.opened_at !== null, r.closed_at !== null])).toEqual([
      [1, true, true],
      [2, true, false],
    ]);
    expect(await outcomes(rounds[0])).toEqual({ included: 5, excluded: 1, no_consensus: 2 });
    const round2 = await db
      .selectFrom("round_element")
      .select("element_id")
      .where("round_id", "=", rounds[1]?.id ?? "")
      .execute();
    expect(round2).toHaveLength(2);
  });

  it("gives the hand-off project two closed rounds, the second settling one element", async () => {
    db = await createTestDb();
    const projectId = await projectOf(await seedDemo(db, "facilitator@example.test"), "handoff");
    const rounds = await roundsOf(projectId);
    expect(rounds.map((r) => [r.number, r.closed_at !== null])).toEqual([
      [1, true],
      [2, true],
    ]);
    expect(await outcomes(rounds[0])).toEqual({ included: 3, excluded: 1, no_consensus: 2 });
    expect(await outcomes(rounds[1])).toEqual({ included: 1, excluded: 0, no_consensus: 1 });
    expect(DEMO_HANDOFF_ELEMENTS.filter((e) => e.round2)).toHaveLength(2);
  });

  it("changes nothing when every demo project already exists", async () => {
    db = await createTestDb();
    const first = await seedDemo(db, "facilitator@example.test");
    const second = await seedDemo(db, "facilitator@example.test");
    expect(second.projects.map((p) => [p.projectId, p.status])).toEqual(
      first.projects.map((p) => [p.projectId, "already_seeded"]),
    );
    const projects = await db
      .selectFrom("organization")
      .select("id")
      .where("name", "in", Object.values(DEMO_PROJECTS))
      .execute();
    expect(projects).toHaveLength(PROJECT_PHASES.length);
  });

  it("adds the missing projects next to one that exists", async () => {
    db = await createTestDb();
    const userId = await insertUser(db, "earlier");
    await grantAppRole(db, "earlier@example.test", "facilitator");
    const earlier = await createProject(db, userId, { name: DEMO_PROJECTS.decide }, "en");
    if (!earlier.ok) throw new Error(earlier.error);
    const summary = await seedDemo(db, "facilitator@example.test");
    expect(summary.projects.map((p) => [p.phase, p.status])).toEqual([
      ["scope", "seeded"],
      ["discover", "seeded"],
      ["decide", "already_seeded"],
      ["handoff", "seeded"],
    ]);
    expect(await projectOf(summary, "decide")).toBe(earlier.value.projectId);
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
