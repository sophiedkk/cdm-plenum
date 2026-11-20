// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { getMigrations } from "better-auth/db/migration";
import { Kysely, PostgresDialect } from "kysely";
import { NO_MIGRATIONS } from "kysely/migration";
import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { ELEMENT_PROMPTS } from "@/lib/brainstorm";
import { DATA_TYPES } from "@/lib/data-types";
import { CHANGE_CLASSES } from "@/lib/panel";
import { createAuth } from "../auth.ts";
import { parseEnv } from "../env.ts";
import { PANEL_MINIMUM_REASON_MAX as ROUNDS_REASON_MAX } from "../rounds/schemas.ts";
import { createMigrator } from "./index.ts";
import { DATA_TYPE_KEYS } from "./migrations/0002_projects.ts";
import { CHANGE_CLASS_KEYS } from "./migrations/0004_panel.ts";
import { PANEL_MINIMUM_REASON_MAX } from "./migrations/0006_group_names_and_raters.ts";
import { ELEMENT_PROMPT_KEYS } from "./migrations/0007_private_brainstorm.ts";
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

  it("allow exactly the brainstorm questions of src/lib/brainstorm.ts", () => {
    expect([...ELEMENT_PROMPT_KEYS]).toEqual([...ELEMENT_PROMPTS]);
  });

  it("allow exactly the change classes of src/lib/panel.ts", () => {
    expect([...CHANGE_CLASS_KEYS]).toEqual([...CHANGE_CLASSES]);
  });

  it("allow the DE13 reason length the round validator takes", () => {
    expect(PANEL_MINIMUM_REASON_MAX).toBe(ROUNDS_REASON_MAX);
  });
});
