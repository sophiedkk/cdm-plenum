// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { getMigrations } from "better-auth/db/migration";
import { Kysely, PostgresDialect } from "kysely";
import { NO_MIGRATIONS } from "kysely/migration";
import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { ELEMENT_PROMPTS } from "@/lib/brainstorm";
import { DATA_TYPES } from "@/lib/data-types";
import { ELEMENT_GROUP_NAME_MAX, GROUP_MISSING_MAX } from "@/lib/element-groups";
import { FIRST_LOOK_ANSWERS } from "@/lib/first-look";
import { CHANGE_CLASSES } from "@/lib/panel";
import { createAuth } from "../auth.ts";
import { ELEMENT_SOURCE_KINDS } from "../elements/queries.ts";
import { parseEnv } from "../env.ts";
import {
  DETAIL_FLAG_KINDS,
  DETAIL_FLAG_REASON_MAX,
  PROPOSAL_DESCRIPTION_MAX,
  PROPOSAL_NAME_MAX,
  PROPOSAL_RULE_MAX,
  PANEL_MINIMUM_REASON_MAX as ROUNDS_REASON_MAX,
} from "../rounds/schemas.ts";
import { SOURCE_MODEL_KINDS, SOURCE_MODEL_STATUSES } from "../sources/queries.ts";
import { SOURCE_LINK_MAX, SOURCE_TITLE_MAX } from "../sources/schemas.ts";
import { createMigrator } from "./index.ts";
import { DATA_TYPE_KEYS } from "./migrations/0002_projects.ts";
import { CHANGE_CLASS_KEYS } from "./migrations/0004_panel.ts";
import { PANEL_MINIMUM_REASON_MAX } from "./migrations/0006_group_names_and_raters.ts";
import { ELEMENT_PROMPT_KEYS } from "./migrations/0007_private_brainstorm.ts";
import * as proposals from "./migrations/0008_round_proposals.ts";
import * as flags from "./migrations/0009_detail_flags.ts";
import * as sources from "./migrations/0012_source_models.ts";
import { FIRST_LOOK_ANSWER_KEYS } from "./migrations/0013_first_look.ts";
import * as groups from "./migrations/0014_element_groups.ts";
import { migrations } from "./migrations/index.ts";
import { baseTestDatabaseUrl, createTestDb } from "./test-db.ts";
import { createRunDatabase, dropRunDatabase } from "./test-run-database.ts";

const TEST_ENV = parseEnv({
  DATABASE_URL: "postgres://unused@localhost/unused",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
  BETTER_AUTH_URL: "http://localhost:3000",
});

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("migrations", () => {
  it("match the schema better-auth expects (no drift)", async () => {
    const db = await createTestDb();
    cleanup = () => db.destroy();
    const auth = createAuth(TEST_ENV, db, { mailer: null, production: false, log: () => {} });
    const plan = await getMigrations({ ...auth.options, database: { db, type: "postgres" } });
    // On failure this prints the SQL to add as a new migration.
    const planned = await plan.compileMigrations();
    expect(planned.trim(), planned).toBe(";");
  });

  it("migrate down to an empty schema and back up again", async () => {
    const baseUrl = baseTestDatabaseUrl();
    const runUrl = await createRunDatabase(baseUrl);
    const db = new Kysely<unknown>({
      dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: runUrl, max: 1 }) }),
    });
    cleanup = async () => {
      await db.destroy();
      await dropRunDatabase(baseUrl, runUrl);
    };
    const migrator = createMigrator(db);
    const names = Object.keys(migrations);
    const first = await migrator.migrateToLatest();
    expect(first.results?.map((r) => r.status)).toEqual(names.map(() => "Success"));
    const down = await migrator.migrateTo(NO_MIGRATIONS);
    expect(down.error).toBeUndefined();
    const tables = await db.introspection.getTables();
    expect(tables.map((t) => t.name)).toEqual([]);
    const up = await migrator.migrateToLatest();
    expect(up.results?.map((r) => r.status)).toEqual(names.map(() => "Success"));
  });

  it("allow exactly the data type keys of src/lib/data-types.ts", () => {
    expect([...DATA_TYPE_KEYS]).toEqual(DATA_TYPES.map((type) => type.key));
  });

  it("allow exactly the first look answers of src/lib/first-look.ts", () => {
    expect([...FIRST_LOOK_ANSWER_KEYS]).toEqual([...FIRST_LOOK_ANSWERS]);
  });

  it("allow the group name and remark lengths the group validators take", () => {
    expect(groups.ELEMENT_GROUP_NAME_MAX).toBe(ELEMENT_GROUP_NAME_MAX);
    expect(groups.GROUP_MISSING_MAX).toBe(GROUP_MISSING_MAX);
  });

  it("allow exactly the brainstorm questions of src/lib/brainstorm.ts", () => {
    expect([...ELEMENT_PROMPT_KEYS]).toEqual([...ELEMENT_PROMPTS]);
  });

  it("allow exactly the change classes of src/lib/panel.ts", () => {
    expect([...CHANGE_CLASS_KEYS]).toEqual([...CHANGE_CLASSES]);
  });

  it("allow the DE13 reason length the round validator takes", () => {
    expect(PANEL_MINIMUM_REASON_MAX).toBe(ROUNDS_REASON_MAX);
  });

  it("allow the DE16 proposal lengths the round validators take", () => {
    expect(proposals.PROPOSAL_RULE_MAX).toBe(PROPOSAL_RULE_MAX);
    expect(proposals.PROPOSAL_NAME_MAX).toBe(PROPOSAL_NAME_MAX);
    expect(proposals.PROPOSAL_DESCRIPTION_MAX).toBe(PROPOSAL_DESCRIPTION_MAX);
  });

  it("allow exactly the DE17 flag kinds and reason length the round validators take", () => {
    expect([...flags.DETAIL_FLAG_KINDS]).toEqual([...DETAIL_FLAG_KINDS]);
    expect(flags.DETAIL_FLAG_REASON_MAX).toBe(DETAIL_FLAG_REASON_MAX);
  });

  it("allow the source model title and link lengths the source validators take", () => {
    expect(sources.SOURCE_TITLE_MAX).toBe(SOURCE_TITLE_MAX);
    expect(sources.SOURCE_LINK_MAX).toBe(SOURCE_LINK_MAX);
    expect([...sources.SOURCE_MODEL_KINDS]).toEqual([...SOURCE_MODEL_KINDS]);
    expect([...sources.SOURCE_MODEL_STATUSES]).toEqual([...SOURCE_MODEL_STATUSES]);
  });

  it("allow exactly the element source kinds the board knows", () => {
    expect([...sources.ELEMENT_SOURCE_KIND_KEYS]).toEqual([...ELEMENT_SOURCE_KINDS]);
    expect(sources.ELEMENT_SOURCE_KIND_KEYS.slice(0, 4)).toEqual([
      ...proposals.ELEMENT_SOURCE_KIND_KEYS,
    ]);
  });
});
