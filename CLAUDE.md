# CLAUDE.md

**cdm-plenum** guides a group of clinicians, information modellers and
terminologists from the scope of a clinical concept to an agreed list of data
elements: a common data model of the concept, before anyone writes it down in
a standard such as an openEHR archetype or a FHIR profile. It uses an element
board, a CKM reuse check and e-Delphi rating rounds. Its first users are
research and teaching groups. The released state is in `CHANGELOG.md`.
The design is `docs/architecture.md` with the records in `docs/adr/`; the
requirements draft is `docs/requirements.md`. The stack and working
discipline follow eduLIMS (<https://github.com/Vernum-Projecten/eduLIMS>,
ADR 0002); check it for a pattern before inventing one.

## Repo map

- `docs/requirements.md`: the requirements draft with stable IDs (PR, SC,
  EL, DE, EX, AD, Q-*). Cite them in issues, tests and PRs. Never invent or
  complete a requirement; ask the owner.
- `docs/architecture.md`: the design authority. An ADR overrides it.
- `docs/adr/`: decision records in MADR format.
- `docs/evaluations/`: dated design evaluations with their findings and sources;
  the ADRs cite them. Kept as the record of why, not updated afterwards.
- `src/routes/`: TanStack Router file routes; `src/routeTree.gen.ts` is
  generated.
- `src/server/<area>/`: server-only code per area (`functions.ts`,
  `queries.ts`, `schemas.ts`), as planned in `docs/architecture.md`.
- `src/server/ckm/` and `src/server/fhir/`: the only modules that call CKM
  (ADR 0006) and the FHIR package registry (ADR 0011); a boundary test in each
  fails when another module names their host. `src/server/fhir/fixtures/`
  holds the synthetic test package. `src/server/sources/` keeps the source
  models of a project (EL12) and their import and coverage table (EL7, EL20).
- `src/lib/`: code both sides import, such as `data-types.ts` (ADR 0009) and
  `cardinality.ts`, with colocated `*.test.ts`.
- `messages/`: the i18n catalogues; `project.inlang/` the Paraglide config.
- `compose.dev.yaml`, `Containerfile.dev`, `scripts/dev/`: the development
  stack; `Containerfile.e2e` the e2e container.
- `docs/testing.md`: the test suites, their settings and the manual
  walkthrough on the demo data. Update it when a suite or a setting changes.
- `tests/e2e/`: the Playwright specs and their fixtures (`fixtures.ts`: seeds,
  `signIn` through Mailpit, `expectAxeClean`).
- `Containerfile`, `compose.yaml`, `.env.example`: the production stack,
  described in `docs/deployment.md`.

## Build and test

Every project command runs in the development container (ADR 0008); never
install Node.js or the dependencies on the host.

```sh
scripts/dev/pnpm.sh install         # install dependencies (exact versions, 24-hour release age)
scripts/dev/compose.sh up -d        # PostgreSQL, Mailpit and the dev server on :3000
scripts/dev/compose.sh down         # stop the stack, keep the database volume
scripts/dev/pnpm.sh build           # production build; also regenerates src/routeTree.gen.ts
scripts/dev/pnpm.sh typecheck       # Paraglide compile, then tsc --noEmit
scripts/dev/pnpm.sh lint            # biome check (fix: biome check --write)
scripts/dev/pnpm.sh test            # Vitest unit tests (test:coverage for the 70% gate)
scripts/dev/pnpm.sh check           # the local gate: typecheck, lint, test
scripts/dev/e2e.sh                  # build, then Playwright with axe in the e2e container
scripts/dev/pnpm.sh db:migrate      # migrate the dev database (db:migrate down reverts one)
scripts/dev/pnpm.sh db:generate-types  # regenerate src/server/db/schema.gen.ts after a migration
scripts/dev/pnpm.sh db:seed-demo --facilitator you@example.test  # one demo project per phase, dev only
```

Versions are pinned exactly in `package.json`; `pnpm-workspace.yaml` sets
`saveExact`, `engineStrict` and a 24-hour `minimumReleaseAge`. Never edit
`src/routeTree.gen.ts`, `src/i18n/` or `src/server/db/schema.gen.ts` (generated).
The unit tests need PostgreSQL running (`scripts/dev/compose.sh up -d postgres`): each
run creates its own migrated database and every test runs in a transaction that is rolled
back. The e2e suite (`scripts/dev/e2e.sh`, arguments go to Playwright) needs PostgreSQL and
Mailpit running; it starts the production build on port 3100 against its own run database and
drops it afterwards. Call `expectAxeClean(page)` from `tests/e2e/fixtures.ts` on every page a
spec visits, in English and Dutch. Migrations live in `src/server/db/migrations/` with `up` and `down`; until the first
stable release a migration may be edited, and the dev database is migrated down and up again. Every hand-written file
starts with the SPDX header `SPDX-FileCopyrightText: Sophie de Klerk` and
`SPDX-License-Identifier: Apache-2.0`, in the file's comment syntax. All UI
text goes through `messages/en.json` and `messages/nl.json` (ADR 0007).

### Continuous integration

`.github/workflows/ci.yml` runs typecheck, lint, `test:coverage` (on a
PostgreSQL service container), build and `test:e2e` (on PostgreSQL and
Mailpit service containers) on every pull request and push to
`main`; the `conclusion` job is the one check to require. Pin every action to
a full commit SHA with the version in a comment, and check workflow changes
with actionlint and zizmor (`uvx zizmor --persona=pedantic .github/`).
Dependabot (`.github/dependabot.yml`) proposes weekly npm and action updates
after a 7-day cooldown. `.github/workflows/ckm-contract.yml` runs
`pnpm test:ckm` against the live CKM every Monday and by hand; run it
locally with `scripts/dev/pnpm.sh test:ckm`. `.github/workflows/fhir-contract.yml`
runs `pnpm test:fhir` against the live FHIR package registry the same way;
run it locally with `scripts/dev/pnpm.sh test:fhir`.

## UI

The UI is React on TanStack Start with Tailwind 4 and shadcn/ui (style
`radix-nova`, `components.json`), held to WCAG 2.1 AA (Q-ACC-1). Build every
page from these patterns; each has a real use and a test you can copy.

- **Components:** add a shadcn/ui component with
  `scripts/dev/pnpm.sh exec shadcn add <name>`; it lands in
  `src/components/ui/` (MIT, shadcn header). Edit a file there only for a
  defect or an accessibility fix. Feature components go in
  `src/components/<area>/`. Style with the theme tokens in
  `src/styles/app.css` (`text-muted-foreground`, `text-destructive`,
  `text-success`, `text-warning`), never with a fixed colour, so dark mode
  (`<html data-theme>`, set from the theme choice in `src/lib/theme.ts`) keeps AA
  contrast. Icons from `lucide-react` carry
  `aria-hidden="true"`.
- **Routes:** pages that need a session live under `src/routes/_authed/`,
  whose layout redirects to `/sign-in` and renders the app shell
  (`src/components/shell/app-shell.tsx`). Its `PersonMenu` under the
  person's name holds language, theme (`LanguageMenuGroup`, `ThemeMenuGroup`)
  and sign out; only an administrator gets a nav, with Projects and
  Administration. Guards
  in `src/lib/guards.ts` steer navigation only; the server function checks
  again. Every route sets a translated `title` in `head()`.
- **Project pages:** `src/routes/_authed/projects/$projectId.tsx` loads the
  project and the user's role once and puts it in the route context
  (`context.project.role`). It renders the project header
  (`src/components/projects/project-header.tsx`, PR11) with the project name
  as the `h1`, so a project page starts with `PageHeader level={2}`, at most
  one intro line, and sets its title with
  `projectTitle(match.context, m.<area>_title())`
  (`src/components/projects/project-title.ts`). Every signed-in page sits
  in the one column `PAGE_COLUMN` of the app shell, so the left edge never
  moves; a page narrows only its reading text, on that same left edge,
  and never centres itself.
- **Project navigation (ADR 0019, ADR 0022):** the header
  (`src/components/projects/project-header.tsx`) shows a back link that names
  its target ("Back to your task" on a participant's step page), the
  name and the phase steps: a done step links to its recap, the current step
  to the phase home (the project index), later steps are plain text (owner
  decision 2026-11-25). A participant has no tabs: the project index
  route is their home (`TaskCard`, `DecidedSoFarSection`, `ProjectPages`,
  `AboutProject`); `homePages` in `src/lib/project-home.ts` decides which
  earlier pages the home links, and every other page links back to the
  home. The facilitator gets
  `ProjectTabs`, fixed as Overview, Scope, Elements, Rounds, Details and a
  Project menu with People and Settings (at most five tabs; the trigger is
  current on those pages and the current tab scrolls into view); a page
  without its own tab (export, brainstorm, import) marks the tab it belongs
  to in `UNDER`. In hand-off the downloads sit on the
  hand-off page (`handoff.tsx`, step `handoff`) with the model for every
  member; `ExportList` is the one list, and the export URL leads there in
  that phase. Overview is the index route for the
  facilitator: `checklist(phase, facts)` decides the items, with
  `done: null` for an item that only informs, and `PhaseMove` holds the
  phase move. A new checklist fact goes into `overviewFacts`
  (`src/server/projects/overview.ts`) and its test; a new participant task
  goes into `src/lib/project-tasks.ts`. The layout's loader revalidates the
  overview query on every navigation; a mutation that changes a count on the
  home or the Overview (an element, a rating) invalidates
  `projectKeys.overview`, which covers the facts and "Decided so far".
- **Phase access:** `src/lib/phase-access.ts` says which step a participant
  sees and writes in per phase (PR9, PR10); a step page uses `requireStep`,
  `writeOpen` and `StepClosedNote`, its server function `phaseOpenFor`; a
  hidden step's URL sends a participant to the project home. The same file
  holds the one switch for data type, cardinality and values in the UI
  (`DETAIL_FIELDS_PHASE`, `detailFieldsShown`, EL21): shown from the detail
  phase on (owner decision 2026-11-20). The board, the
  element form, the rating card, its overview and the round page all read
  it; the database, the server and the export keep the fields. A new step
  is a new column in the table. The discover pages of ADR 0020 are steps
  too: `models` and `grouping` (the facilitator's), `first_look` and
  `group_check` (a participant `answer`s there). The detail phase has the
  step `details` (`src/server/details/`, ADR 0017): a participant `answer`s
  structure and code proposals there; an architect also proposes a
  structure, a terminologist codes, and a second terminologist reviews them
  (`terminology.ts`).
- **Phase recaps:** a done phase step in the header links to
  `/projects/$projectId/recap/$phase` (PR13, `phaseDone` in
  `src/lib/project-phases.ts`); the current and later steps are no links.
  A new phase adds its view to `src/components/projects/phase-recap.tsx`.
- **Drag and drop:** move cards with pointer events, so a mouse, a pen and a
  finger work alike, and always offer the keyboard path next to it: pick a
  card with a click or Enter, then a "Move <name> here" button per target
  (`src/components/board/grouping-board.tsx`, WCAG 2.1.1, 2.5.1).
- **Element groups:** the database places a new element in the group of its
  brainstorm question and gives each new project its four starting groups
  (triggers in migration 0014); code never sets `group_id` on insert.
- **Data:** each area keeps a key factory and query options in
  `src/server/<area>/query-options.ts` (example:
  `src/server/projects/query-options.ts`, staleness in
  `src/lib/query-config.ts`). A loader calls
  `context.queryClient.ensureQueryData(...)`, the component reads with
  `useSuspenseQuery`. A mutation calls the server function through
  `useServerFn` and then invalidates keys from the factory.
- **Forms:** `useAppForm` from `src/components/form/app-form.ts` with a Zod
  schema whose messages come from `messages/` and whose limits match the
  server function's validator (`newProjectSchema` in
  `src/components/projects/new-project-form.tsx`). Use `form.AppField` with
  `field.TextField` or `field.TextareaField`, `form.FormErrors` at the top and
  `form.SubmitButton`; they wire the label, `aria-describedby` and the focus
  move to the first invalid field. Show a refusal with `applyServerRefusal`
  (`src/lib/forms/server-refusal.ts`): `{ form }` for the whole form,
  `{ fields: { name } }` for one field. Test a form as
  `src/components/projects/new-project-form.test.tsx` does.
- **Refusal codes:** `refusalMessage(code)` in `src/lib/i18n/refusals.ts`
  maps every code the server returns to a message key. A new code in a
  `*_ACTION_ERRORS` list fails `refusals.test.ts` until it has a key and an
  English and Dutch text. Never show a raw code.
- **Status and outcome:** `StatusBadge` (`src/components/status/`) always
  shows its text; colour and icon only add to it (Q-ACC-2). Example:
  `PhaseBadge` and `RoleBadge` in `src/components/projects/project-badges.tsx`,
  with labels from `src/lib/i18n/labels.ts`.
- **Settings page:** `/projects/$projectId/settings` is the facilitator's
  (`requireStep("settings")`, PR12) and holds project-wide choices: the
  panel (`PanelSetup`) and the forms in
  `src/components/settings/facilitator-settings.tsx`. A new project setting
  goes there, never on a task page.
- **Dialogs for forms:** a form that is not the page's task opens from a
  button in `FormDialog` (`src/components/members/form-dialog.tsx`), as the
  invite and new-group forms on Members do.
- **Route states:** `src/components/shell/route-states.tsx` has
  `PageSkeleton` (the router's default pending state), `EmptyState`,
  `RouteErrorState` (the default error state, with a retry) and
  `NotFoundState`. A loader that gets `not_found` throws `notFound()`.
- **Layout rules** (UI/UX analysis of 2026-11-20,
  `docs/evaluations/2026-11-20-ui-ux-analysis.md`): show each piece of
  information once, in its best form, never as a picture and a text that say
  the same, and never a link next to a status that could itself be the link
  (owner decision); one filled button per view,
  for the next step, the rest outline or text; type by role, defined once in
  `src/styles/app.css` (`type-meta` 14, `type-body` 16, `type-section` 18,
  `type-page-title` 24, `type-home-card` 30; nothing under 14 for content;
  weights 400 and 600, and 500 stays allowed for controls: buttons, labels,
  table heads, tabs); components use the role, never a pixel size; spacing on 4 px (24 between blocks, 48 between
  sections); a card for the task card and repeated independent items, a list
  for what participants read, a table only for facilitator comparisons of four
  rows or more; a page has at most one short line under its title saying what
  it is for; field help is short, under the field, only where the label alone
  is not enough; show a value only when it says something; settings save
  on change or with one save bar per page; controls do not move when a panel
  opens: it opens below them.
- **Standard-agnostic wording:** the tool builds a common data model of a
  concept, whatever standard implements it later. UI text, requirements and
  docs say "the model" or "the data model", not "the archetype"; name openEHR,
  FHIR or zib only where a feature is specific to it, such as the CKM reuse
  check or the RM data types (owner decision 2026-11-20).
- **Message keys:** every new key starts with its area: `shell_`,
  `projects_`, `scope_`, `board_`, `rounds_`, `members_`, `admin_`,
  `export_`, `details_` or `common_` (shared text and the `common_refusal_*` messages).
  Keep both catalogues sorted (`biome check --write` sorts them).
  `src/lib/i18n/messages.test.ts` checks the prefixes, that Dutch has every
  English key with the same placeholders, and that no text has an em dash.

- **Comments:** `src/components/comments/` is the comment thread the scope
  page and the board share. A page's own field components can use
  `useFieldContext` with `useFieldA11y` (see
  `src/components/board/element-fields.tsx`) without registering in
  `app-form.ts`.
- **CKM in e2e:** the suite runs a CKM stub (`tests/e2e/ckm-stub.ts`) on
  `E2E_CKM_PORT` (default 3101) and points `CKM_BASE_URL` at it, so no spec
  calls the live CKM.
- **Select fields and dates:** `field.SelectField` is registered in
  `src/components/form/app-form.ts`; `DateTime` in
  `src/components/status/date-time.tsx` renders a timestamp.
- **Parallel e2e runs** need their own `E2E_PORT`: podman-compose puts the
  stack's containers in one network namespace, so two runs on the default
  port collide.
- **Dates and time zones:** `src/components/rounds/format.ts` formats round
  dates in the browser's time zone and names the zone. Name the date parts
  one by one: Chromium rejects `dateStyle` together with a time zone name.
- **Unit tests of Radix controls** such as checkboxes need a `ResizeObserver`
  stub in jsdom (see the tests in `src/components/rounds/`).
- **E2E sign-in** (`signIn` in `tests/e2e/fixtures.ts`) works in English only;
  the rounds and export specs use their own `signInAs(page, email, locale)`.

## Development environment

Develop a larger application inside a container by default, so its runtimes,
services and dependencies stay off the host. Use Podman (a `Containerfile`,
plus `podman compose` when the app needs several services) or a toolbx
container. A small script or single-file tool can run on the host. Do not
install project dependencies on the host without asking first.

<!-- Which one this project uses, and how to enter it, e.g.:
     toolbox create <name> && toolbox enter <name>
     podman compose up -d && podman compose exec app bash -->

## Hard rules

<!-- Project-specific rules that must never be broken. Pair each rule with the
check that enforces it where one exists. -->

## Working style

- Check the project's own requirements before applying these rules: its
  CLAUDE.md, `.claude/rules/`, CONTRIBUTING, PR template and CI checks. Where a
  project rule differs from a rule here, or a rule here does not fit the
  project, raise it with me and we decide together. Do not pick one silently.
- Plan together before big decisions: ask questions and give a recommended option.
- Do not scaffold or build while the design is still open. Build once the direction is confirmed.
- Verify your own work before reporting it done. Say what was verified and what was not.
- Ask before anything hard to undo: deleting files, force-pushing, rewriting history.
- Delete a plan or design markdown file in the change that implements it. The
  lasting record is the issue, the PR, the changelog, git history and the
  reference docs.

## Writing

Applies to all prose a person reads: docs, README, comments, commits, PRs and issues.
Write plainly, so the text reads like a person wrote it for another person.

Avoid these AI tells:

- **Em dashes:** use a comma, period, colon or parentheses instead. In a defining
  bullet, put the colon inside the bold (`- **Term:** text`). Write "16 to 32 GB",
  not an en-dash range.
- **"Not X, but Y" framing:** state what the thing is. Use a contrast only to
  correct a belief the reader actually holds.
- **Decorative triads** ("fast, simple, powerful"): keep a real list at its real
  length and cut a decorative one to the word that matters.
- **Inflated words:** delve, underscore, pivotal, realm, harness, illuminate,
  shed light on, facilitate, bolster, refine, differentiate, streamline, robust,
  elevate, testament, landscape, leverage, tapestry, foster, empower, unlock,
  journey, synergy, holistic. Use the plain word: explore, show, important,
  area, use, explain, help, support, improve, tell apart, simplify.
- **Hype:** revolutionize, innovative, cutting-edge, state-of-the-art,
  game-changing, groundbreaking, transformative, seamless (integration),
  scalable solution. Cut the word and state the specific fact: what changed,
  by how much, compared to what.
- **Stock transitions:** "That being said", "At its core", "To put it simply",
  "This underscores the importance of", "A key takeaway is", "From a broader
  perspective", "It is worth noting that", "At the end of the day", "In short",
  "In summary". Open with
  the subject of the sentence. Swapping in "Fundamentally" or "Simply put" is
  the same tell.
- **Hedging:** "generally speaking", "typically", "tends to", "arguably", "to
  some extent", "broadly speaking", and adverbs like simply, genuinely, notably,
  importantly, quietly. Make the claim, or narrow it to what you know ("in 3 of
  the 4 test files").
- **TED-talk tone:** rhetorical questions, inspirational build-ups, "imagine a world where".
- **Robotic rhythm:** sentences of the same length and shape in a row. Vary them.
  A short sentence is fine.
- **Generic content:** general statements anyone could write. Use the specific
  case, number, file or example from this project.
- **Predictable formatting:** headings, bullets and bold on everything. Use
  sentence case for headings ("Build and test", not "Build And Test"). Write
  reasoning as paragraphs; use bullets only for real lists. Bold a term once,
  where it is defined.
- **Padding and flattery:** no praise of the reader's work ("great question",
  "careful report"), no recap of what the reader already knows, no closing
  summary, no sentence that announces the next one ("Two things follow.").
  One thank-you clause at most, then the facts.
- **Claims that outrun the facts:** never say something was done when it was
  not. A draft is not a submission and a local issue is not an upstream report.
  Name what exists, with its link, and say what has not happened yet.
- **Facts that go stale:** do not type a status ("in beta", "not released yet")
  or a version number into prose that nothing updates. Link the release page
  or the file that pins it.

Follow the Google developer documentation style (<https://developers.google.com/style>):
address the reader as "you", use active voice and present tense, keep sentences
near 25 words, and prefer concrete nouns and numbers to adjectives.

## Dutch text

The Writing rules above apply to Dutch too. These rules add what is specific to Dutch.

Avoid these Dutch AI tells:

- **Inflated words:** cruciaal, essentieel, naadloos, baanbrekend, innovatief,
  robuust, krachtig, waardevol, een cruciale rol spelen, duiken in, ontdekken
  (as in "Ontdek hoe..."). Use the plain word: belangrijk, nodig, werkt samen
  met, nieuw.
- **Stock openings and closings:** "In de huidige digitale wereld", "In het
  snel veranderende landschap van", "Het is belangrijk om op te merken dat",
  "Laten we eens kijken naar", "Kortom," or "Samenvattend," before a summary
  that repeats the text. Start with the subject and stop when the point is made.
- **Translated English:** "Het is belangrijk om te noteren", "aan het einde van
  de dag", "dat maakt sense", "realiseren" for "beseffen", "niet alleen X, maar
  ook Y" as a set phrase, "Of je nu X bent of Y". Write the sentence a Dutch
  speaker would say.
- **Officialese (ambtelijke taal):** middels, teneinde, inzake, ten behoeve van,
  betreffende, dienen te, alsmede, reeds, echter at the start of a sentence.
  Use via, om, over, voor, moeten, en, al, maar.
- **Nominalizations:** "het uitvoeren van een analyse" becomes "analyseren";
  "er wordt gezorgd voor" becomes "we zorgen voor". Prefer an active verb to a
  noun with "van".
- **Gedachtestreepje:** the Dutch spaced dash (" – ") is the same tell as the
  English em dash. Use a comma, period, colon or parentheses.

Mechanics:

- Address the reader as "je", not "u", unless the project says otherwise.
  Aim for B1 level: short sentences, common words.
- Spell by the Woordenlijst (Groene Boekje) and check doubts at
  <https://onzetaal.nl/taaladvies>.
- Write compounds as one word: "datamodel", "projectmap", "testbestand", not
  "data model". Use a hyphen where vowels clash or for an English part:
  "data-analyse", "e-mailadres", "open-sourceproject".
- Conjugate English verbs the Dutch way: "gedownload", "geüpdatet", "gecommit".
  Use the Dutch word where one is common: "bestand", not "file".
- Headings and titles use sentence case: "Aan de slag", not "Aan De Slag".
- Months and days are lowercase: "maandag 16 november 2026".
- Numbers use a decimal comma and a thousands point: "3,5 GB", "1.200 bestanden".
  Code, config and data keep the dot decimal.

## Scripts

- Write shell scripts in bash, as eduLIMS does (owner decision, ADR 0002).
  This differs from the owner's personal default of fish.
- Use Python when a script needs a library or formatted output, such as
  mutagen to edit tags or rich to print tables.
- Keep a Python script in one file with its dependencies in a PEP 723 block
  (<https://packaging.python.org/en/latest/specifications/inline-script-metadata/>),
  run by uv: start it with `#!/usr/bin/env -S uv run --script` and a
  `# /// script` block that sets `requires-python` and `dependencies`. Do not
  rely on a shared venv.
- Build the command line with rich-click (`import rich_click as click`) and
  print with rich. A script that changes files shows the changes in a table
  first, stops there with `--dry-run`, asks before writing unless `--yes` is
  given, shows a progress bar on long runs and never overwrites an existing
  file without checking. Raise `click.ClickException` for errors, so the
  script exits with code 1.
- Check Python scripts with `uvx ruff check --line-length 120` and
  `uvx ruff format --line-length 120`.

## Code comments

- A comment says why. The code shows what.
- No essays and no change narration ("previously", "now correctly"). History
  belongs in the commit, PR or issue.
- Use two markers only. `TODO(#N): <what is missing>` is pending work, linked to
  an issue. `NOTE: <citation and one sentence>` records a settled decision, in at
  most 3 lines. No `FIXME`, `HACK`, `XXX` or `WIP`.
- Deferred work is a TODO, never prose like "lands later" or "handled in a
  follow-up".
- Keep comment runs short (at most 8 lines). Longer text belongs in the API docs
  or the PR.

## Tests

- Never weaken, skip or delete a test, or widen a tolerance, to make a build pass.
  Never edit a test to route around a bug it exposes. If the fix is unclear,
  leave the test failing and record a `TODO(#N)`.
- Every error path a change adds gets a test that asserts the failure.
- Review snapshot changes line by line before accepting them.
- Build in small increments that compile and pass the tests.

## Sources

- Implement against the specification or the official documentation, not from
  memory. Cite it for decisions a reviewer could question.
- Cite durable references only: the standard, official docs, the docs of the
  pinned version. An internal markdown file or another implementation is not an
  authority.
- Where no specification covers a decision, say so: "no spec governs this, our
  own design".

## Personal data and secrets

- Tests, fixtures, examples, screenshots, commits, issues and PRs use invented
  data only. Never write a real name, national ID number (BSN), address, phone
  number, email or date of birth into them.
- Logs, metrics and error messages may carry record identifiers. They never
  carry a person's own data.
- Never commit a key, token, password or `.env` file. A committed secret stays
  in every clone and backup, so rotate it; deleting the file does not help.

## Git

- Commit or push only when asked. Never force-push `main`.
- A pull request auto-merges when CI is green; review by a person is a
  convention, not a branch rule (ADR 0002).
- Branches: `<type>/<kebab-slug>`, with type `feat`, `fix`, `chore`, `docs`,
  `refactor`, `perf`, `test`, `ci` or `build`.
- Commit messages follow Conventional Commits (`feat: add CSV export`) and describe
  only the change.
- No AI attribution anywhere: no `Co-Authored-By: Claude` trailer, no "Generated
  with Claude Code" line, no 🤖 footer. Not in commits, PRs, issues or code. AI use
  is disclosed once, in the README's "Use of AI" section.
- User-visible changes get an entry under `[Unreleased]` in `CHANGELOG.md`
  (Keep a Changelog 1.1.0), in one of Added, Changed, Deprecated, Removed, Fixed
  or Security. Write it for the user of the software, not as commit prose.
- A PR description says what changed and why, names what a caller must change
  if an interface breaks, and links its issue (`Closes #N`).
