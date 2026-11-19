// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// better-auth: sessions, and projects as organizations with stakeholder groups as teams
// (ADR 0004). TODO(#2): sign-in by e-mail link and invitations through the magic link plugin.
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import type { Kysely } from "kysely";
import type { Env } from "./env.ts";

export function createAuth(env: Env, db: Kysely<unknown>) {
  return betterAuth({
    database: { db, type: "postgres" },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [organization({ teams: { enabled: true } })],
  });
}
