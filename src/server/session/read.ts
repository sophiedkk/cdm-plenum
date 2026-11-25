// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one place the app reads a session. better-auth ends an idle session itself; the absolute
// cap of 30 days after sign-in is ours (owner decision 2026-11-25, PR1; OWASP ASVS 5.0
// requirement 7.3.2), because better-auth has none. A session past the cap is deleted and reads
// as signed out.
import type { Kysely } from "kysely";
import { SESSION_MAX_DAYS } from "@/lib/sign-in";
import type { Auth } from "../auth.ts";
import type { DB } from "../db/schema.gen.ts";

const DAY_MS = 86_400_000;

/** The session of the request, or `null` when there is none, it expired, or it passed the cap. */
export async function readSession(
  auth: Auth,
  db: Kysely<DB>,
  headers: Headers,
  now: Date = new Date(),
) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  if (now.getTime() - session.session.createdAt.getTime() >= SESSION_MAX_DAYS * DAY_MS) {
    await db.deleteFrom("session").where("id", "=", session.session.id).execute();
    return null;
  }
  return session;
}
