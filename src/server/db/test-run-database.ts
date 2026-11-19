// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A database per test run, created next to the database TEST_DATABASE_URL names and dropped at
// the end, so parallel runs never share a schema. Relative imports only: plain Node loads it.
import { randomBytes } from "node:crypto";
import pg from "pg";

const RUN_SUFFIX = /_run_[0-9a-f]{8}$/;

/** Returns the database name `url` points at. */
export function databaseOf(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (name === "") throw new Error("The database URL names no database.");
  return name;
}

/** Returns `url` with its database replaced by `database`. */
export function withDatabase(url: string, database: string): string {
  const next = new URL(url);
  next.pathname = `/${encodeURIComponent(database)}`;
  return next.toString();
}

/** Returns a new run database name next to `base`. */
export function newRunDatabaseName(base: string): string {
  return `${base}_run_${randomBytes(4).toString("hex")}`;
}

async function onBase<T>(baseUrl: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: baseUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Creates an empty run database next to the one `baseUrl` names and returns its URL. */
export async function createRunDatabase(baseUrl: string): Promise<string> {
  const name = newRunDatabaseName(databaseOf(baseUrl));
  await onBase(baseUrl, (client) =>
    client.query(`CREATE DATABASE ${pg.escapeIdentifier(name)} ENCODING 'UTF8' TEMPLATE template0`),
  );
  return withDatabase(baseUrl, name);
}

/** Drops the run database `runUrl` names; refuses any database that is not a run database. */
export async function dropRunDatabase(baseUrl: string, runUrl: string): Promise<void> {
  const name = databaseOf(runUrl);
  if (!RUN_SUFFIX.test(name) || !name.startsWith(`${databaseOf(baseUrl)}_run_`)) {
    throw new Error(`Refusing to drop ${name}: it is not a test run database.`);
  }
  await onBase(baseUrl, (client) =>
    client.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(name)} WITH (FORCE)`),
  );
}
