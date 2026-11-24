// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A sign-in link for the development sign-in page. The magic link plugin makes the link as for
// the sign-in form, and the browser opens it, so the session comes from the same verification
// as every sign-in: the deactivation check and the `signed_in` entry of src/server/auth.ts.
import type { Kysely } from "kysely";
import { type Auth, DEV_SIGN_IN_DELIVERY } from "../auth.ts";
import type { DB } from "../db/schema.gen.ts";
import { type DevSignInResult, devSignInAddress } from "./queries.ts";

/** Where the browser lands after a development sign-in. */
export const DEV_SIGN_IN_TARGET = "/projects";

/**
 * The path and query of a single-use sign-in link for the account, or a refusal when the
 * setting is off or the account is not active. Sends no e-mail.
 */
export async function devSignInLink(
  auth: Auth,
  db: Kysely<DB>,
  enabled: boolean,
  userId: string,
  headers: Headers,
): Promise<DevSignInResult<string>> {
  const address = await devSignInAddress(db, enabled, userId);
  if (!address.ok) return address;
  let link: string | undefined;
  // NOTE: better-auth 1.7 magic link plugin (https://www.better-auth.com/docs/plugins/magic-link):
  // `auth.api.signInMagicLink` forwards `metadata` to `sendMagicLink`, which hands us the URL.
  await auth.api.signInMagicLink({
    body: {
      email: address.value,
      callbackURL: DEV_SIGN_IN_TARGET,
      errorCallbackURL: "/sign-in",
      metadata: { [DEV_SIGN_IN_DELIVERY]: (url: string) => (link = url) },
    },
    headers,
  });
  if (link === undefined) return { ok: false, error: "account_not_found" };
  const url = new URL(link);
  return { ok: true, value: `${url.pathname}${url.search}` };
}
