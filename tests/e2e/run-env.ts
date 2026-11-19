// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// What one e2e run needs to know: its port, its own database and where Mailpit listens.
// playwright.config.ts evaluates this in the runner and again in every worker; the runner stores
// the run database URL in process.env, which the workers and the web server inherit.
import {
  databaseOf,
  newRunDatabaseName,
  withDatabase,
} from "../../src/server/db/test-run-database.ts";

/** The dev stack names inside the compose network (compose.dev.yaml); CI sets localhost. */
const DEFAULTS = {
  TEST_DATABASE_URL: "postgres://cdm_plenum:cdm_plenum@postgres:5432/cdm_plenum",
  SMTP_URL: "smtp://mailpit:1025",
  MAILPIT_URL: "http://mailpit:8025",
  E2E_PORT: "3100",
} as const;

function setting(name: keyof typeof DEFAULTS): string {
  return process.env[name]?.trim() || DEFAULTS[name];
}

/** The database the run database sits next to; the role needs CREATEDB. */
export function baseDatabaseUrl(): string {
  return setting("TEST_DATABASE_URL");
}

/** This run's database: named once in the runner, read back in every worker. */
export function runDatabaseUrl(): string {
  const base = baseDatabaseUrl();
  process.env["E2E_RUN_DATABASE_URL"] ??= withDatabase(base, newRunDatabaseName(databaseOf(base)));
  return process.env["E2E_RUN_DATABASE_URL"];
}

export function appPort(): number {
  const port = Number(setting("E2E_PORT"));
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`E2E_PORT=${setting("E2E_PORT")} is not a port.`);
  }
  return port;
}

export function appUrl(): string {
  return `http://localhost:${appPort()}`;
}

export function smtpUrl(): string {
  return setting("SMTP_URL");
}

export function mailpitUrl(): string {
  return setting("MAILPIT_URL");
}

/** A public, e2e-only secret: the app refuses to start without 32 characters. */
export const E2E_AUTH_SECRET = "e2e-only-secret-not-for-production-use-0123456789";
