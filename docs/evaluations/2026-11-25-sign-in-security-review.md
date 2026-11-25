<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Sign-in and session review against OWASP ASVS 5.0

2026-11-25, for issue #65. The owner set the threat model and the session
lifetime on 2026-11-25. This file reviews the e-mail link sign-in and the
sessions of cdm-plenum against the authentication (V6), session management
(V7) and cookie (V3) chapters of the OWASP Application Security Verification
Standard 5.0.0, and records the gaps.

## Sources

- OWASP ASVS 5.0.0, read from the `v5.0.0` tag of the OWASP/ASVS repository:
  [V6 Authentication](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x15-V6-Authentication.md),
  [V7 Session Management](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x16-V7-Session-Management.md),
  [V3 Web Frontend Security](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x12-V3-Web-Frontend-Security.md).
- better-auth 1.7.25, the version `package.json` pins: its magic link plugin
  and session defaults, read in the installed package.
- The code on main of 2026-11-25: `src/server/auth.ts`, `src/lib/sign-in.ts`,
  `src/server/admin/queries.ts`.

## Threat model

**What the tool holds.** No patient data, ever: the tool models data
elements, not records about people (owner, 2026-11-25). The only personal
data is each account's e-mail address and name. E-mail addresses reach the
administration page, the facilitator's own queries (people, reminders, and
raters where a round allows it, DE4) and the person's own menu. Participants
never see an address; they see names only when the facilitator turns that on
(PR7).

**What an attacker could gain.**

1. *Study integrity.* Someone who signs in as a participant can rate,
   comment and answer proposals in their place. That damages the consensus
   of one project; it exposes no health data.
2. *Rating anonymity.* Signed in as the facilitator of a round that shows
   raters, someone could link ratings to people (ADR 0005). A participant's
   account never reveals another participant's ratings.
3. *Addresses and names.* Signed in as a facilitator or an administrator,
   someone could read the addresses and names of the people in their
   projects or the whole app.

**Who could try.** Mainly someone with access to a participant's or
facilitator's mailbox, or to a device left signed in. The tool is for
research and teaching groups, so the stake is the validity of a study, not
care.

**Decision.** The tool targets ASVS level 1, plus the level 2 session
requirements that cost little. The e-mail link as the only sign-in factor is
an accepted risk under this threat model, recorded below. A second factor
becomes necessary before the tool holds anything more sensitive than
addresses, names and ratings.

## Findings

Status: **met**, **gap** (with the issue or change that closes it), or
**accepted** (a documented deviation).

### V6 Authentication

| Req. | Level | What it asks | cdm-plenum | Status |
| --- | --- | --- | --- | --- |
| 6.1.1 | L1 | Document rate limiting and anti-automation, and prevent malicious lockout. | 30 requests per 60 s per IP address on asking for a link and opening one (`SIGN_IN_RATE_LIMIT`), in production only; no lockout. Documented here. | met |
| 6.3.1 | L1 | Controls against credential stuffing and brute force. | No passwords; the rate limit above covers asking for and opening links. | met |
| 6.4.1 | L1 | Initial or activation codes are random and expire after a short time or first use. | A link token of 32 random letters, single use, 5 minutes. | met |
| 6.5.1 | L2 | Out-of-band codes are usable once. | The magic link plugin deletes the token on use. | met |
| 6.5.3, 6.5.4 | L2 | Codes come from a CSPRNG with at least 20 bits of entropy. | `generateRandomString(32, "a-z", "A-Z")`, about 182 bits. | met |
| 6.5.2 | L2 | Codes under 112 bits are stored with a salted password hash. | Over 112 bits, stored hashed (`storeToken: "hashed"`). | met |
| 6.5.5 | L2 | Out-of-band requests live at most 10 minutes. | 5 minutes (`SIGN_IN_LINK_MINUTES`). | met |
| 6.6.2 | L2 | A code is bound to the request that created it. | A link works in any browser, not only the one that asked for it. A mail scanner that opens the link uses it up. | gap: #65 adds a confirmation click, so a scanner no longer uses the link; binding to the browser stays open (accepted at L1) |
| 6.3.8 | L3 | Failed sign-ins do not reveal which accounts exist. | Asking for a link gives the same answer for any address. | met |
| 6.3.3 | L2 | Multi-factor or a combination of factors. | The e-mail link is the only factor. | accepted (threat model) |
| 6.3.6 | L3 | E-mail is not an authentication factor. | It is the only factor. | accepted (threat model) |

### V7 Session management

| Req. | Level | What it asks | cdm-plenum | Status |
| --- | --- | --- | --- | --- |
| 7.1.1 | L2 | Inactivity timeout and absolute lifetime are documented. | Documented here and in PR1. | met with #65 |
| 7.3.1 | L2 | An inactivity timeout enforces re-authentication. | A session ends after 7 days without use; used, it is extended once a day (better-auth `expiresIn` 7 days, `updateAge` 1 day). | met |
| 7.3.2 | L2 | An absolute maximum lifetime enforces re-authentication. | None: a session used daily never ends. | gap: #65 ends every session 30 days after sign-in (owner decision 2026-11-25); a database trigger keeps `expiresAt` within the cap, so better-auth ends the session on every path, its own endpoints included |
| 7.2.1 | L1 | Session tokens are verified on the server. | better-auth checks every request against the session table. | met |
| 7.2.2, 7.2.3 | L1 | Dynamically generated reference tokens from a CSPRNG, at least 128 bits. | better-auth reference tokens of 32 random characters. | met |
| 7.2.4 | L1 | A new session token on sign-in. | Each verified link creates a new session. | met |
| 7.4.1 | L1 | No use of a session after sign-out or expiry. | Sign-out deletes the session row. | met |
| 7.4.2 | L1 | Disabling an account ends its sessions. | Deactivation deletes the account's sessions (AD1). | met |
| 7.4.4 | L2 | Every signed-in page has a visible sign-out. | "Sign out" in the person menu on every page. | met |
| 7.4.5 | L2 | Administrators can end the sessions of one user or all users. | Only by deactivating the account. | gap at L2, not needed at L1 |
| 7.5.2 | L2 | Users see and end their own active sessions. | Not available. | gap at L2, not needed at L1 |

### V3 Cookies

| Req. | Level | What it asks | cdm-plenum | Status |
| --- | --- | --- | --- | --- |
| 3.3.1 | L1 | Cookies are `Secure` with a `__Secure-` or `__Host-` prefix. | `__Secure-` prefix and `Secure` on https (better-auth, from `BETTER_AUTH_URL`). | met |
| 3.3.2 | L2 | `SameSite` set for the cookie's purpose. | `SameSite=Lax`, so the link from an e-mail signs in. | met |
| 3.3.3 | L2 | `__Host-` prefix unless shared with other hosts. | better-auth 1.7.25 prefixes `__Secure-`, not `__Host-`. | gap at L2, not needed at L1 |
| 3.3.4 | L2 | Session cookies are `HttpOnly`. | `HttpOnly` (better-auth default). | met |
| 3.5.1 | L1 | Requests not protected by CORS preflight are checked to come from the app. | better-auth checks the origin of its requests against `BETTER_AUTH_URL`; server functions require the session cookie with `SameSite=Lax`. | met |

## What #65 changes

1. **Confirmation click.** The e-mail link opens a page with one button
   that signs in; opening the page does not use the token, so a mail
   scanner or a link preview leaves the link usable (6.6.2, partly).
2. **Session lifetime.** 7 days without use, and at most 30 days after
   sign-in, then a new link (7.3.1, 7.3.2; owner decisions 2026-11-25).
   The database keeps every session within the 30 days (migration 0024), so
   no path can extend it further. Recorded in PR1.

## Accepted risks and later work

- **One factor (6.3.3, 6.3.6).** Accepted for the data cdm-plenum holds. A
  second factor, for example a passkey, comes before the tool holds anything
  more sensitive.
- **Link not bound to the browser (6.6.2).** Accepted at L1; the confirmation
  click removes the practical scanner problem.
- **L2 session tools (7.4.5, 7.5.2) and `__Host-` (3.3.3).** Not needed at L1.
  If the tool aims for L2, each needs an issue.
