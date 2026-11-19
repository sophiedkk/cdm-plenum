// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// `node tests/e2e/run-database.ts`: creates the run database DATABASE_URL names, next to
// TEST_DATABASE_URL. The web server command of playwright.config.ts runs it before the
// migrations, because Playwright starts the web server before any global setup.
// Relative imports only: plain Node runs it.
import { createRunDatabase } from "../../src/server/db/test-run-database.ts";

async function main(): Promise<number> {
  const baseUrl = process.env["TEST_DATABASE_URL"];
  const runUrl = process.env["DATABASE_URL"];
  if (!baseUrl || !runUrl) {
    console.error("run-database: TEST_DATABASE_URL and DATABASE_URL must be set");
    return 1;
  }
  try {
    await createRunDatabase(baseUrl, runUrl);
  } catch (error) {
    console.error(
      "run-database: cannot create the e2e run database. Is PostgreSQL running " +
        "(scripts/dev/compose.sh up -d postgres mailpit)?",
      error instanceof Error ? error.message : error,
    );
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main();
}
