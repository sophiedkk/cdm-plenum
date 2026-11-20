// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// `pnpm db:seed-demo [--facilitator <email>]`: fills a development database with one demo project
// so the whole flow can be tried in a minute. Every step goes through the app's own services, so
// the data obeys the same rules as real use. Invented people and `example.test` addresses only.
// Refuses to run with NODE_ENV=production.
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { grantAppRole, normalizeEmail } from "../admin/app-roles.ts";
import { addElement, addElementComment, setElementValues } from "../elements/queries.ts";
import { acceptInvitationsOnSignIn } from "../invitations/acceptance.ts";
import { invite } from "../invitations/queries.ts";
import { movePhase } from "../projects/phase.ts";
import { createProject } from "../projects/queries.ts";
import { closeRound, createRound, openRound } from "../rounds/queries.ts";
import { saveRating } from "../rounds/ratings.ts";
import { addScopeComment, addScopeSource, updateScope } from "../scope/queries.ts";
import type { DB } from "./schema.gen.ts";

export const DEMO_PROJECT_NAME = "Blood pressure (demo)";
const DEFAULT_FACILITATOR = "facilitator@example.test";

/** A refused service call stops the seed with the step and the refusal code. */
function must<T>(step: string, result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`seed-demo: ${step} refused: ${result.error}`);
  return result.value;
}

/** The demo panel: group key (English default group name) and invented people. */
export const DEMO_PARTICIPANTS = [
  { email: "nurse.a@example.test", name: "Nurse A (demo)", group: "Nursing" },
  { email: "nurse.b@example.test", name: "Nurse B (demo)", group: "Nursing" },
  { email: "nurse.c@example.test", name: "Nurse C (demo)", group: "Nursing" },
  { email: "gp.a@example.test", name: "GP A (demo)", group: "Primary care" },
  { email: "physician.a@example.test", name: "Physician A (demo)", group: "General medicine" },
  { email: "terminologist.a@example.test", name: "Terminologist A (demo)", group: "Terminology" },
  { email: "architect.a@example.test", name: "Architect A (demo)", group: "Architecture" },
  { email: "architect.b@example.test", name: "Architect B (demo)", group: "Architecture" },
] as const;

type Cardinality = { min: 0 | 1; max: number | null };
interface DemoElement {
  name: string;
  description: string;
  dataType: "quantity" | "coded_text" | "text";
  cardinality: Cardinality;
  values?: string[];
  /** Scores in round 1 in the order of DEMO_PARTICIPANTS; null is "unable to rate". */
  round1: (number | null)[];
}

// Scores chosen so round 1 under the default rule gives every outcome: included (at least 70%
// score 7 to 9, at most 15% score 1 to 3), excluded, and no consensus.
export const DEMO_ELEMENTS: DemoElement[] = [
  {
    name: "Systolic",
    description: "The peak arterial pressure during contraction of the left ventricle.",
    dataType: "quantity",
    cardinality: { min: 1, max: 1 },
    round1: [9, 9, 8, 9, 9, 8, 9, 9],
  },
  {
    name: "Diastolic",
    description: "The lowest arterial pressure, during relaxation of the heart.",
    dataType: "quantity",
    cardinality: { min: 1, max: 1 },
    round1: [9, 8, 8, 9, 9, 7, 9, 8],
  },
  {
    name: "Position",
    description: "The body position of the person during the measurement.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Standing", "Sitting", "Reclining", "Lying"],
    round1: [7, 8, 7, 6, 8, 9, 7, 5],
  },
  {
    name: "Location of measurement",
    description: "Where on the body the blood pressure was measured.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Right arm", "Left arm", "Right thigh", "Left thigh"],
    round1: [7, 8, 8, 9, 7, 6, 8, 7],
  },
  {
    name: "Mean arterial pressure",
    description: "The average arterial pressure over one cardiac cycle.",
    dataType: "quantity",
    cardinality: { min: 0, max: 1 },
    round1: [5, 6, 4, 7, 3, 6, 5, null],
  },
  {
    name: "Cuff size",
    description: "The size of the cuff used for the measurement.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Adult thigh", "Large adult", "Adult", "Small adult", "Paediatric/child", "Infant"],
    round1: [6, 7, 5, 8, 4, 7, 6, 6],
  },
  {
    name: "Pulse pressure",
    description: "The difference between the systolic and the diastolic pressure.",
    dataType: "quantity",
    cardinality: { min: 0, max: 1 },
    round1: [2, 3, 1, 4, 2, 3, 5, 2],
  },
  {
    name: "Comment",
    description: "Anything about the measurement not captured in the other elements.",
    dataType: "text",
    cardinality: { min: 0, max: 1 },
    round1: [7, 7, 8, 6, 7, 8, 9, 7],
  },
];

async function ensureUser(db: Kysely<DB>, email: string, name: string): Promise<string> {
  const address = normalizeEmail(email);
  const found = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", address)
    .executeTakeFirst();
  if (found) return found.id;
  const id = randomUUID();
  await db.insertInto("user").values({ id, name, email: address, emailVerified: true }).execute();
  return id;
}

async function groupIdByName(db: Kysely<DB>, projectId: string, name: string): Promise<string> {
  const row = await db
    .selectFrom("team")
    .select("id")
    .where("organizationId", "=", projectId)
    .where("name", "=", name)
    .executeTakeFirst();
  if (!row) throw new Error(`seed-demo: no stakeholder group "${name}"`);
  return row.id;
}

export interface SeedSummary {
  status: "seeded" | "already_seeded";
  projectId: string;
  facilitator: string;
  participants: string[];
}

/** Seeds the demo project once; a second run finds it and changes nothing. */
export async function seedDemo(
  db: Kysely<DB>,
  facilitatorEmail: string,
  now: Date = new Date(),
): Promise<SeedSummary> {
  const participants = DEMO_PARTICIPANTS.map((person) => person.email);
  const existing = await db
    .selectFrom("organization")
    .select("id")
    .where("name", "=", DEMO_PROJECT_NAME)
    .executeTakeFirst();
  if (existing) {
    return {
      status: "already_seeded",
      projectId: existing.id,
      facilitator: facilitatorEmail,
      participants,
    };
  }

  const facilitatorId = await ensureUser(db, facilitatorEmail, "Demo facilitator");
  await grantAppRole(db, facilitatorEmail, "facilitator");
  await grantAppRole(db, facilitatorEmail, "administrator");

  const { projectId } = must(
    "create project",
    await createProject(db, facilitatorId, { name: DEMO_PROJECT_NAME }, "en"),
  );

  must(
    "scope",
    await updateScope(db, facilitatorId, {
      projectId,
      concept:
        "The local measurement of the systemic arterial blood pressure of an adult, as recorded at the outpatient clinic and at home.",
      useCases:
        "Outpatient visit; home measurement reported by the patient; follow-up of hypertension treatment.",
      outOfScope: "Invasive (intra-arterial) pressure; 24-hour ambulatory monitoring summaries.",
    }),
  );
  must(
    "scope source",
    await addScopeSource(db, facilitatorId, {
      projectId,
      label: "openEHR CKM archetype openEHR-EHR-OBSERVATION.blood_pressure.v2",
      url: null,
    }),
  );
  must(
    "scope source",
    await addScopeSource(db, facilitatorId, {
      projectId,
      label: "Outpatient blood pressure form of the demo clinic (invented)",
      url: null,
    }),
  );

  const raterIds: string[] = [];
  for (const person of DEMO_PARTICIPANTS) {
    const userId = await ensureUser(db, person.email, person.name);
    must(
      `invite ${person.email}`,
      await invite(
        db,
        facilitatorId,
        {
          projectId,
          groupId: await groupIdByName(db, projectId, person.group),
          email: person.email,
        },
        { baseUrl: "http://localhost:3000", mailer: null, now },
      ),
    );
    await acceptInvitationsOnSignIn(db, userId, now);
    raterIds.push(userId);
  }

  must(
    "scope comment",
    await addScopeComment(db, raterIds[0] ?? facilitatorId, {
      projectId,
      body: "Should home measurements by the patient be in scope from the start?",
    }),
  );

  must(
    "phase discover",
    await movePhase(db, facilitatorId, { projectId, from: "scope", direction: "next" }),
  );
  const elementIds: string[] = [];
  for (const [index, element] of DEMO_ELEMENTS.entries()) {
    const author = raterIds[index % raterIds.length] ?? facilitatorId;
    const { elementId } = must(
      `element ${element.name}`,
      await addElement(db, author, {
        projectId,
        name: element.name,
        description: element.description,
        dataType: element.dataType,
        cardinality: element.cardinality,
        source: index < 4 ? "Outpatient form" : "",
      }),
    );
    if (element.values) {
      must(
        `values ${element.name}`,
        await setElementValues(db, facilitatorId, {
          projectId,
          elementId,
          values: element.values.map((text) => ({ text, value: null })),
        }),
      );
    }
    elementIds.push(elementId);
  }
  const cuffSize = elementIds[5];
  if (cuffSize) {
    must(
      "element comment",
      await addElementComment(db, raterIds[3] ?? facilitatorId, {
        projectId,
        elementId: cuffSize,
        body: "We rarely record the cuff size, but it explains odd readings.",
      }),
    );
  }

  must(
    "phase decide",
    await movePhase(db, facilitatorId, { projectId, from: "discover", direction: "next" }),
  );
  // Round 1: rated by everyone, then closed, so results exist.
  const oneDay = 24 * 60 * 60 * 1000;
  const round1 = must(
    "create round 1",
    await createRound(
      db,
      facilitatorId,
      { projectId, closesAt: new Date(now.getTime() + oneDay) },
      { now },
    ),
  );
  must(
    "open round 1",
    await openRound(db, facilitatorId, { projectId, roundId: round1.roundId }, { now }),
  );
  for (const [e, element] of DEMO_ELEMENTS.entries()) {
    const elementId = elementIds[e];
    if (!elementId) continue;
    for (const [r, score] of element.round1.entries()) {
      const raterId = raterIds[r];
      if (!raterId) continue;
      must(
        `rating ${element.name}`,
        await saveRating(db, raterId, {
          projectId,
          roundId: round1.roundId,
          elementId,
          score,
          ...(score === null ? { reason: "Outside my practice." } : {}),
          ...(element.name === "Cuff size" && score !== null && score <= 5
            ? { reason: "Hardly ever recorded in our clinic." }
            : {}),
        }),
      );
    }
  }
  // NOTE: development data only. The DE2 trigger refuses a new closing date on an open round; the
  // seed moves it into the past with triggers off in one transaction, as the e2e rounds spec does,
  // so the round can close the normal way. Needs a superuser role, true for the dev stack.
  await db.transaction().execute(async (trx) => {
    await sql`set local session_replication_role = replica`.execute(trx);
    await trx
      .updateTable("round")
      .set({ closes_at: new Date(now.getTime() - 60_000) })
      .where("id", "=", round1.roundId)
      .execute();
  });
  must(
    "close round 1",
    await closeRound(db, facilitatorId, { projectId, roundId: round1.roundId }, { now }),
  );

  // Round 2: the elements without consensus, open for a week, so participants can rate now.
  const round2 = must(
    "create round 2",
    await createRound(
      db,
      facilitatorId,
      { projectId, closesAt: new Date(now.getTime() + 7 * oneDay) },
      { now },
    ),
  );
  must(
    "open round 2",
    await openRound(db, facilitatorId, { projectId, roundId: round2.roundId }, { now }),
  );

  return {
    status: "seeded",
    projectId,
    facilitator: normalizeEmail(facilitatorEmail),
    participants,
  };
}

/** The command line, separated from the process so its refusals can be tested. */
export async function seedDemoCommand(
  args: readonly string[],
  env: Record<string, string | undefined>,
  out: (line: string) => void,
  connect: (url: string) => Kysely<DB> = (url) =>
    new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }),
    }),
): Promise<number> {
  if (env["NODE_ENV"] === "production") {
    out("seed-demo: refused with NODE_ENV=production");
    return 1;
  }
  let facilitator = DEFAULT_FACILITATOR;
  try {
    const { values } = parseArgs({
      args: [...args],
      options: { facilitator: { type: "string" } },
      strict: true,
    });
    facilitator = values.facilitator ?? DEFAULT_FACILITATOR;
  } catch {
    out("usage: db:seed-demo [--facilitator <email>]");
    return 2;
  }
  const url = env["DATABASE_URL"];
  if (!url) {
    out("Invalid environment configuration: DATABASE_URL");
    return 1;
  }
  const db = connect(url);
  try {
    const summary = await seedDemo(db, facilitator);
    out(
      summary.status === "seeded"
        ? `Seeded "${DEMO_PROJECT_NAME}".`
        : `"${DEMO_PROJECT_NAME}" already exists; nothing changed.`,
    );
    out(`Facilitator and administrator: ${summary.facilitator}`);
    out(`Participants: ${summary.participants.join(", ")}`);
    out(
      "Sign in at http://localhost:3000/sign-in; the e-mail arrives in Mailpit at http://localhost:8025.",
    );
    return 0;
  } finally {
    await db.destroy();
  }
}

if (import.meta.main) {
  const print = (line: string) => {
    // biome-ignore lint/suspicious/noConsole: the CLI's own output
    console.log(line);
  };
  process.exitCode = await seedDemoCommand(process.argv.slice(2), process.env, print);
}
