// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The development sign-in page (DEV_SIGN_IN, docs/testing.md): who you can sign in as, and the
// check before a sign-in. Every function takes whether the setting is on and refuses as
// `not_found` when it is off, so the page and its functions do not exist outside development.
import type { Kysely } from "kysely";
import { APP_ROLES, type AppRole } from "../admin/app-roles.ts";
import type { DB } from "../db/schema.gen.ts";

/** Why a development sign-in was refused; the screens map each code to a message. */
export const DEV_SIGN_IN_ERRORS = ["not_found", "account_not_found"] as const;
export type DevSignInError = (typeof DEV_SIGN_IN_ERRORS)[number];

export type DevSignInResult<T> = { ok: true; value: T } | { ok: false; error: DevSignInError };

export interface DevSignInPerson {
  id: string;
  /** The account name; empty until the person sets one. */
  name: string;
  email: string;
}

/**
 * One heading on the page: everyone with an application role under their first role in
 * `APP_ROLES`, then everyone else under the name of their first stakeholder group, then the
 * people in no group.
 */
export type DevSignInGroup = { people: DevSignInPerson[] } & (
  | { kind: "role"; role: AppRole }
  | { kind: "group"; name: string }
  | { kind: "none" }
);

function byNameThenEmail(a: DevSignInPerson, b: DevSignInPerson): number {
  return (a.name || a.email).localeCompare(b.name || b.email) || a.email.localeCompare(b.email);
}

function add<K>(map: Map<K, DevSignInPerson[]>, key: K, person: DevSignInPerson): void {
  const people = map.get(key);
  if (people) people.push(person);
  else map.set(key, [person]);
}

/** Every active account, grouped for the page; refuses when the setting is off. */
export async function devSignInPeople(
  db: Kysely<DB>,
  enabled: boolean,
): Promise<DevSignInResult<DevSignInGroup[]>> {
  if (!enabled) return { ok: false, error: "not_found" };
  const users = await db
    .selectFrom("user")
    .select(["id", "name", "email"])
    .where("deactivated_at", "is", null)
    .execute();
  const roles = await db.selectFrom("app_role").select(["email", "role"]).execute();
  // The first group a person joined; a tie goes to the group name, so the order is fixed.
  const memberships = await db
    .selectFrom("teamMember")
    .innerJoin("team", "team.id", "teamMember.teamId")
    .select(["teamMember.userId", "team.name"])
    .orderBy("teamMember.createdAt", "asc")
    .orderBy("team.name", "asc")
    .execute();

  const rolesOf = new Map<string, Set<string>>();
  for (const row of roles) {
    rolesOf.set(row.email, (rolesOf.get(row.email) ?? new Set<string>()).add(row.role));
  }
  const firstGroup = new Map<string, string>();
  for (const row of memberships) {
    if (!firstGroup.has(row.userId)) firstGroup.set(row.userId, row.name);
  }

  const byRole = new Map<AppRole, DevSignInPerson[]>();
  const byGroup = new Map<string, DevSignInPerson[]>();
  const inNoGroup: DevSignInPerson[] = [];
  for (const user of users) {
    const held = rolesOf.get(user.email);
    const role = APP_ROLES.find((candidate) => held?.has(candidate));
    const group = firstGroup.get(user.id);
    if (role !== undefined) add(byRole, role, user);
    else if (group !== undefined) add(byGroup, group, user);
    else inNoGroup.push(user);
  }

  const groups: DevSignInGroup[] = [];
  for (const role of APP_ROLES) {
    const people = byRole.get(role);
    if (people) groups.push({ kind: "role", role, people: people.sort(byNameThenEmail) });
  }
  for (const [name, people] of [...byGroup].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({ kind: "group", name, people: people.sort(byNameThenEmail) });
  }
  if (inNoGroup.length > 0) groups.push({ kind: "none", people: inNoGroup.sort(byNameThenEmail) });
  return { ok: true, value: groups };
}

/** The address to sign in as; refuses when the setting is off or the account is not active. */
export async function devSignInAddress(
  db: Kysely<DB>,
  enabled: boolean,
  userId: string,
): Promise<DevSignInResult<string>> {
  if (!enabled) return { ok: false, error: "not_found" };
  const user = await db
    .selectFrom("user")
    .select("email")
    .where("id", "=", userId)
    .where("deactivated_at", "is", null)
    .executeTakeFirst();
  if (!user) return { ok: false, error: "account_not_found" };
  return { ok: true, value: user.email };
}
