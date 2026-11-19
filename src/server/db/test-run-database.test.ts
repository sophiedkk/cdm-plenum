// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import pg from "pg";
import { describe, expect, it } from "vitest";
import { baseTestDatabaseUrl } from "./test-db.ts";
import {
  createRunDatabase,
  databaseOf,
  dropRunDatabase,
  newRunDatabaseName,
  withDatabase,
} from "./test-run-database.ts";

async function exists(baseUrl: string, name: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: baseUrl });
  await client.connect();
  try {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
    return rowCount === 1;
  } finally {
    await client.end();
  }
}

describe("run databases", () => {
  it("creates the run database a caller names, and drops it", async () => {
    const baseUrl = baseTestDatabaseUrl();
    const wanted = withDatabase(baseUrl, newRunDatabaseName(databaseOf(baseUrl)));
    const runUrl = await createRunDatabase(baseUrl, wanted);
    try {
      expect(runUrl).toBe(wanted);
      expect(await exists(baseUrl, databaseOf(runUrl))).toBe(true);
    } finally {
      await dropRunDatabase(baseUrl, runUrl);
    }
    expect(await exists(baseUrl, databaseOf(runUrl))).toBe(false);
  });

  it("refuses to create a database that is not a run database", async () => {
    const baseUrl = baseTestDatabaseUrl();
    await expect(createRunDatabase(baseUrl, withDatabase(baseUrl, "production"))).rejects.toThrow(
      "Refusing to create production: it is not a test run database.",
    );
    await expect(
      createRunDatabase(baseUrl, withDatabase(baseUrl, "other_run_0123abcd")),
    ).rejects.toThrow("Refusing to create other_run_0123abcd");
  });

  it("refuses to drop a database that is not a run database", async () => {
    const baseUrl = baseTestDatabaseUrl();
    await expect(dropRunDatabase(baseUrl, baseUrl)).rejects.toThrow(
      `Refusing to drop ${databaseOf(baseUrl)}: it is not a test run database.`,
    );
  });
});
