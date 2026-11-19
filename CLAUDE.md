# CLAUDE.md

<!-- One paragraph: what this project is, who it is for, and its current state. -->

## Repo map

<!-- The main folders and what lives in each. -->

## Build and test

```sh
# install:
# build:
# test:
# lint/format:
```

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

- Write shell scripts in fish, not bash, and use fish's own builtins so the
  script reads plainly: `path` for file names and extensions, `contains` to
  check a value against a list, `string` for text, and a named function for a
  step with a long command.
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
