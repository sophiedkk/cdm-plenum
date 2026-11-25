// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The absolute session lifetime (PR1, OWASP ASVS 5.0 requirement 7.3.2): a session never lasts
// longer than 30 days after sign-in, however often it is used. better-auth extends `expiresAt`
// on use and offers no cap, so the database keeps it within the cap on every insert and update;
// better-auth then ends the session itself on every path, its own endpoints included.
import { type Kysely, sql } from "kysely";

// NOTE: written out, so this migration never changes when src/lib/sign-in.ts does; a test checks
// that both agree.
export const SESSION_MAX_DAYS = 30;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create function session_lifetime_cap() returns trigger language plpgsql as $$
    begin
      new."expiresAt" := least(new."expiresAt", new."createdAt" + make_interval(days => ${sql.lit(SESSION_MAX_DAYS)}));
      return new;
    end
    $$
  `.execute(db);
  await sql`
    create trigger session_lifetime_cap before insert or update on session
    for each row execute function session_lifetime_cap()
  `.execute(db);
  // Sessions from before the cap get it too.
  await sql`
    update session set "expiresAt" = "createdAt" + make_interval(days => ${sql.lit(SESSION_MAX_DAYS)})
    where "expiresAt" > "createdAt" + make_interval(days => ${sql.lit(SESSION_MAX_DAYS)})
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop trigger session_lifetime_cap on session`.execute(db);
  await sql`drop function session_lifetime_cap()`.execute(db);
}
