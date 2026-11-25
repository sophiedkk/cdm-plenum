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

// NOTE: owner decision 2026-11-25 (PR1; OWASP ASVS 5.0 requirement 7.3.1 and 7.3.2): a session
// ends after 7 days without use, is extended once a day while used, and ends 30 days after sign-in.
// better-auth sets `expiresIn` and `updateAge` (https://www.better-auth.com/docs/concepts/session-management);
// the 30-day cap is ours (src/server/session/read.ts), as better-auth has none.
export const SESSION_IDLE_DAYS = 7;
export const SESSION_EXTEND_DAYS = 1;
export const SESSION_MAX_DAYS = 30;

const VERIFY_PATH = "/api/auth/magic-link/verify";
const CONFIRM_PATH = "/sign-in/confirm";

/** The query parameters of better-auth's verification URL that the confirmation page passes on. */
export const VERIFY_PARAMS = [
  "token",
  "callbackURL",
  "newUserCallbackURL",
  "errorCallbackURL",
] as const;

/**
 * The link the e-mail carries: our confirmation page with the verification URL's query. Opening
 * it touches no token (owner decision 2026-11-25, PR1; OWASP ASVS 5.0 requirement 6.6.2).
 */
export function confirmLinkUrl(verifyUrl: string): string {
  const url = new URL(verifyUrl);
  return new URL(`${CONFIRM_PATH}${url.search}`, url.origin).toString();
}

/** The path the confirmation button opens: better-auth's verification, which uses the token up. */
export function verifyPath(
  search: Readonly<Partial<Record<(typeof VERIFY_PARAMS)[number], string | undefined>>>,
): string {
  const params = new URLSearchParams();
  for (const key of VERIFY_PARAMS) {
    const value = search[key];
    if (value !== undefined) params.set(key, value);
  }
  return `${VERIFY_PATH}?${params.toString()}`;
}
