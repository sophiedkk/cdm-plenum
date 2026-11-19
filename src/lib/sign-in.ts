// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// What the sign-in page and the server agree on about sign-in links.

// NOTE: magic link plugin default (https://www.better-auth.com/docs/plugins/magic-link); no
// requirement sets the lifetime of a sign-in link.
export const SIGN_IN_LINK_MINUTES = 5;

/** The error code a refused account creation redirects with (`?error=SIGN_UP_NOT_ALLOWED`). */
export const SIGN_UP_REFUSED = "SIGN_UP_NOT_ALLOWED";

/** The messages the sign-in page shows for an `error` search parameter. */
export type SignInError = "not_invited" | "invalid_link";

/** Maps better-auth's `error` search parameter to the message the sign-in page shows. */
export function signInError(code: string | undefined): SignInError | null {
  if (code === undefined || code === "") return null;
  return code === SIGN_UP_REFUSED ? "not_invited" : "invalid_link";
}
