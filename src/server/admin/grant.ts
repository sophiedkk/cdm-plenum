// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// `pnpm admin:grant <email> [--facilitator]` and `pnpm admin:revoke <email> [--facilitator]`:
// the host command that gives the first administrator and the first facilitator a way in (AD1).
// Without a flag the role is `administrator`. Prints an outcome code, never the address back.
// Runs on plain Node (type stripping) with DATABASE_URL only.
import { parseArgs } from "node:util";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { z } from "zod";
import type { DB } from "../db/schema.gen.ts";
import { type AppRole, grantAppRole, revokeAppRole } from "./app-roles.ts";

export const USAGE =
  "usage: admin:grant <email> [--facilitator] | admin:revoke <email> [--facilitator]";

export interface GrantCommand {
  action: "grant" | "revoke";
  email: string;
  role: AppRole;
}

/** Parses `grant|revoke <email> [--facilitator]`; `null` for anything else. */
export function parseGrantArgs(args: readonly string[]): GrantCommand | null {
  const parse = () =>
    parseArgs({
      args: [...args],
      options: { facilitator: { type: "boolean" } },
      allowPositionals: true,
      strict: true,
    });
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse();
  } catch {
    return null;
  }
  const [action, email, ...extra] = parsed.positionals;
  if (extra.length > 0 || (action !== "grant" && action !== "revoke")) return null;
  const address = z.email().max(254).safeParse(email);
  if (!address.success) return null;
  return {
    action,
    email: address.data,
    role: parsed.values.facilitator ? "facilitator" : "administrator",
  };
}

/** Runs one command against `db`; returns the exit code. */
export async function runGrant(
  db: Kysely<DB>,
  command: GrantCommand,
  out: (line: string) => void,
): Promise<number> {
  const outcome =
    command.action === "grant"
      ? await grantAppRole(db, command.email, command.role)
      : await revokeAppRole(db, command.email, command.role);
  out(`${outcome}: ${command.role}`);
  return 0;
}

async function main(): Promise<number> {
  const command = parseGrantArgs(process.argv.slice(2));
  if (command === null) {
    console.error(USAGE);
    return 2;
  }
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("Invalid environment configuration: DATABASE_URL");
    return 1;
  }
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }),
  });
  try {
    // biome-ignore lint/suspicious/noConsole: the CLI's own output
    return await runGrant(db, command, (line) => console.log(line));
  } finally {
    await db.destroy();
  }
}

if (import.meta.main) {
  process.exitCode = await main();
}
