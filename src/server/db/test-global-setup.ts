// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Vitest global setup: one migrated database for this run, dropped when the run ends.
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { createMigrator } from "./index.ts";
import { baseTestDatabaseUrl } from "./test-db.ts";
import { createRunDatabase, dropRunDatabase } from "./test-run-database.ts";

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const baseUrl = baseTestDatabaseUrl();
  let runUrl: string;
  try {
    runUrl = await createRunDatabase(baseUrl);
  } catch (error) {
    throw new Error(
      "Cannot create a test run database. Start PostgreSQL with `scripts/dev/compose.sh up -d postgres` or set TEST_DATABASE_URL.",
      { cause: error },
    );
  }
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: runUrl, max: 1 }) }),
  });
  try {
    const { error } = await createMigrator(db).migrateToLatest();
    if (error) throw error;
  } catch (error) {
    await db.destroy();
    await dropRunDatabase(baseUrl, runUrl);
    throw new Error("The migrations fail on an empty test database.", { cause: error });
  }
  await db.destroy();
  project.provide("testDatabaseUrl", runUrl);
  return () => dropRunDatabase(baseUrl, runUrl);
}
