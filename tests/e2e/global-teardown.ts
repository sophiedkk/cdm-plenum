// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Drops this run's database after the last spec. WITH (FORCE) closes the web server's
// connections, which Playwright stops only after this teardown.
import { dropRunDatabase } from "../../src/server/db/test-run-database.ts";
import { baseDatabaseUrl, runDatabaseUrl } from "./run-env.ts";

export default async function globalTeardown(): Promise<void> {
  await dropRunDatabase(baseDatabaseUrl(), runDatabaseUrl());
}
