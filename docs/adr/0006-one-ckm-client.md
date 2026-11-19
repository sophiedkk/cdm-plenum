<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0006. One CKM client on the CKM REST API

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner (use the CKM API), maintainer (design)

## Context and problem statement

Linking and importing elements (EL4, EL7) need a search over archetypes and
the element list of one archetype. The international CKM serves a REST API
at `https://ckm.openehr.org/ckm/rest` that answers without sign-in; the calls
are listed in [requirements.md](../requirements.md#external-sources). The
openEHR CKM mirror on GitHub (<https://github.com/openEHR/CKM-mirror>) holds
the same archetypes as files.

## Considered options

1. The CKM REST API, through one client module.
2. A local copy of the CKM mirror, refreshed on a schedule.

## Decision outcome

Option 1. It gives CKM's own relevance search and the current revision
without a copy to refresh. The mirror stays the fallback if the API becomes
unusable (R-06); switching is a new record.

- `src/server/ckm/` is the only module that calls CKM. A unit test fails when
  another module names the CKM base URL.
- Every call has a timeout, reads a capped body, follows no redirect and
  returns a typed result.
- Search results and element lists are cached for one day.
- A link stores the archetype ID, `cid`, revision and at-code.

### Consequences

- Good: one place to change when CKM changes.
- Bad: the API has no published versioned documentation that we found; a
  contract test against the live CKM runs in CI on a schedule, not on every
  change.
