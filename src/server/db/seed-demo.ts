// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// `pnpm db:seed-demo [--facilitator <email>]`: fills a development database with one demo project
// per phase, so every step can be tried in a minute. Every step goes through the app's own
// services, so the data obeys the same rules as real use. Invented people and `example.test`
// addresses only. Refuses to run with NODE_ENV=production.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { ElementPrompt } from "@/lib/brainstorm";
import type { ProjectPhase } from "@/lib/project-phases";
import { grantAppRole, normalizeEmail } from "../admin/app-roles.ts";
import type { CkmClient } from "../ckm/client.ts";
import { parseArchetypeXml } from "../ckm/parse.ts";
import { answerDetail, proposeDetail, settleDetail } from "../details/queries.ts";
import { proposeCodes, skipReview } from "../details/terminology.ts";
import { revealBoard } from "../elements/brainstorm.ts";
import { answerFirstLook } from "../elements/first-look.ts";
import { addElement, addElementComment, setElementValues } from "../elements/queries.ts";
import { acceptInvitationsOnSignIn } from "../invitations/acceptance.ts";
import { invite } from "../invitations/queries.ts";
import { movePhase } from "../projects/phase.ts";
import { createProject } from "../projects/queries.ts";
import { closeRound, createRound, openRound } from "../rounds/queries.ts";
import { saveRating } from "../rounds/ratings.ts";
import { addScopeComment, addScopeSource, updateScope } from "../scope/queries.ts";
import { addCkmSource, putOnList, sourceCoverage } from "../sources/queries.ts";
import type { DB } from "./schema.gen.ts";

const DEFAULT_FACILITATOR = "facilitator@example.test";
const ONE_DAY = 24 * 60 * 60 * 1000;

/** The demo projects, one per phase, in the order of the phases (PR4). */
export const DEMO_PROJECTS = {
  scope: "Body temperature (demo)",
  discover: "Heart rate (demo)",
  decide: "Blood pressure (demo)",
  detail: "Oxygen saturation (demo)",
  handoff: "Respiratory rate (demo)",
} as const satisfies Record<ProjectPhase, string>;

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
/** Scores per rater in the order of DEMO_PARTICIPANTS; null is "unable to rate". */
type Scores = (number | null)[];
interface DemoElement {
  name: string;
  /** The brainstorm question the element answers (EL14). */
  prompt: ElementPrompt;
  description: string;
  dataType: "quantity" | "coded_text" | "text" | null;
  cardinality: Cardinality | null;
  values?: string[];
  round1?: Scores;
  /** Only for an element without consensus in round 1. */
  round2?: Scores;
}

// Scores chosen so round 1 under the default rule gives every outcome: included (at least 70%
// score 7 to 9, at most 15% score 1 to 3), excluded, and no consensus.
export const DEMO_ELEMENTS: DemoElement[] = [
  {
    name: "Systolic",
    prompt: "recorded",
    description: "The peak arterial pressure during contraction of the left ventricle.",
    dataType: "quantity",
    cardinality: { min: 1, max: 1 },
    round1: [9, 9, 8, 9, 9, 8, 9, 9],
  },
  {
    name: "Diastolic",
    prompt: "recorded",
    description: "The lowest arterial pressure, during relaxation of the heart.",
    dataType: "quantity",
    cardinality: { min: 1, max: 1 },
    round1: [9, 8, 8, 9, 9, 7, 9, 8],
  },
  {
    name: "Position",
    prompt: "patient_state",
    description: "The body position of the person during the measurement.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Standing", "Sitting", "Reclining", "Lying"],
    round1: [7, 8, 7, 6, 8, 9, 7, 5],
  },
  {
    name: "Location of measurement",
    prompt: "method",
    description: "Where on the body the blood pressure was measured.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Right arm", "Left arm", "Right thigh", "Left thigh"],
    round1: [7, 8, 8, 9, 7, 6, 8, 7],
  },
  {
    name: "Mean arterial pressure",
    prompt: "recorded",
    description: "The average arterial pressure over one cardiac cycle.",
    dataType: "quantity",
    cardinality: { min: 0, max: 1 },
    round1: [5, 6, 4, 7, 3, 6, 5, null],
  },
  {
    name: "Cuff size",
    prompt: "method",
    description: "The size of the cuff used for the measurement.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Adult thigh", "Large adult", "Adult", "Small adult", "Paediatric/child", "Infant"],
    round1: [6, 7, 5, 8, 4, 7, 6, 6],
  },
  {
    name: "Pulse pressure",
    prompt: "recorded",
    description: "The difference between the systolic and the diastolic pressure.",
    dataType: "quantity",
    cardinality: { min: 0, max: 1 },
    round1: [2, 3, 1, 4, 2, 3, 5, 2],
  },
  {
    name: "Comment",
    prompt: "context",
    description: "Anything about the measurement not captured in the other elements.",
    dataType: "text",
    cardinality: { min: 0, max: 1 },
    round1: [7, 7, 8, 6, 7, 8, 9, 7],
  },
];

/**
 * The private brainstorm of the discover demo: who added what (index into DEMO_PARTICIPANTS).
 * Two participants add the same element and a third a near duplicate, so the reveal shows the
 * facilitator something to merge. Three participants have added nothing yet.
 */
export const DEMO_BRAINSTORM: { by: number; element: DemoElement }[] = [
  { by: 0, element: brainstormed("Heart rate", "recorded", "Beats per minute.") },
  { by: 0, element: brainstormed("Regularity", "recorded", "Regular or irregular.") },
  { by: 1, element: brainstormed("Pulse rate", "recorded", "Counted at the wrist.") },
  { by: 1, element: brainstormed("Body position", "patient_state", "Lying, sitting or standing.") },
  { by: 3, element: brainstormed("Heart rate", "recorded", "") },
  { by: 3, element: brainstormed("Method", "method", "Palpation, auscultation or a device.") },
  { by: 4, element: brainstormed("Location", "method", "Radial, carotid or apical.") },
  { by: 5, element: brainstormed("Exertion", "patient_state", "At rest or after exercise.") },
  { by: 5, element: brainstormed("Clinical setting", "context", "Ward, outpatient or home.") },
];

/** The archetype the discover demo starts from, stored in tests/fixtures/ckm (no network). */
export const DEMO_ARCHETYPE = {
  cid: "1013.1.4295",
  archetypeId: "openEHR-EHR-OBSERVATION.pulse.v2",
  name: "Pulse/Heart beat",
  revision: "2.0.9",
  file: "pulse.v2.xml",
} as const;

/** A CKM client that answers from the stored archetype only, so the seed never calls CKM. */
function storedCkm(): CkmClient {
  return {
    async searchArchetypes() {
      return { kind: "ok", value: [] };
    },
    async archetypeElements(cid) {
      if (cid !== DEMO_ARCHETYPE.cid) return { kind: "refused", status: 404 };
      const xml = readFileSync(
        new URL(`../../../tests/fixtures/ckm/${DEMO_ARCHETYPE.file}`, import.meta.url),
        "utf8",
      );
      const parsed = parseArchetypeXml(xml);
      if (!parsed.ok) return { kind: "unusable" };
      return {
        kind: "ok",
        value: {
          cid: DEMO_ARCHETYPE.cid,
          archetypeId: DEMO_ARCHETYPE.archetypeId,
          name: DEMO_ARCHETYPE.name,
          status: "PUBLISHED",
          revision: DEMO_ARCHETYPE.revision,
          originalLanguage: parsed.value.originalLanguage,
          elements: parsed.value.elements,
        },
      };
    },
  };
}

/**
 * The first look of the discover demo: how many of the elements from the archetype each of the
 * first participants answered, in order; the answers cycle so the counts differ per element.
 */
export const DEMO_FIRST_LOOK = [
  { by: 0, count: Infinity },
  { by: 1, count: Infinity },
  { by: 2, count: 4 },
];
const FIRST_LOOK_CYCLE = ["belongs", "belongs", "not_sure", "belongs", "not_belongs"] as const;

function brainstormed(name: string, prompt: ElementPrompt, description: string): DemoElement {
  return { name, prompt, description, dataType: null, cardinality: null };
}

// Two rounds: round 1 gives every outcome, round 2 settles one of the two elements without
// consensus and leaves the other open, as a real hand-off can.
export const DEMO_HANDOFF_ELEMENTS: DemoElement[] = [
  {
    name: "Rate",
    prompt: "recorded",
    description: "The number of breaths per minute.",
    dataType: "quantity",
    cardinality: { min: 1, max: 1 },
    round1: [9, 9, 8, 9, 9, 8, 9, 9],
  },
  {
    name: "Regularity",
    prompt: "recorded",
    description: "Whether the breathing is regular or irregular.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Regular", "Irregular"],
    round1: [7, 8, 5, 6, 7, 4, 8, 6],
    round2: [8, 8, 7, 7, 7, 6, 8, 7],
  },
  {
    name: "Depth",
    prompt: "recorded",
    description: "How deep the breaths are.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Shallow", "Normal", "Deep"],
    round1: [5, 6, 4, 7, 3, 6, 5, 4],
    round2: [5, 6, 5, 7, 4, 6, 5, 6],
  },
  {
    name: "Body position",
    prompt: "patient_state",
    description: "The body position during the count.",
    dataType: "coded_text",
    cardinality: { min: 0, max: 1 },
    values: ["Lying", "Sitting", "Standing"],
    round1: [7, 8, 7, 7, 8, 6, 7, 8],
  },
  {
    name: "Ventilator mode",
    prompt: "context",
    description: "The mode of a ventilator, for a person on mechanical ventilation.",
    dataType: "text",
    cardinality: { min: 0, max: 1 },
    round1: [2, 1, 3, 2, 3, 4, 2, 1],
  },
  {
    name: "Comment",
    prompt: "context",
    description: "Anything about the count not captured in the other elements.",
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

interface Seeded {
  projectId: string;
  /** The participants' user ids, in the order of DEMO_PARTICIPANTS. */
  raterIds: string[];
}

interface ScopeText {
  concept: string;
  useCases: string;
  outOfScope: string;
  sources: string[];
}

/** Creates a project with its scope and the whole demo panel invited and joined. */
/** The detail project's elements: round 1 includes the first three and excludes the last. */
export const DEMO_DETAIL_ELEMENTS: DemoElement[] = [
  {
    name: "SpO2",
    prompt: "recorded",
    description: "The oxygen saturation of arterial blood, measured by pulse oximetry.",
    dataType: null,
    cardinality: null,
    round1: [9, 9, 9, 8, 9, 8, 9, 9],
  },
  {
    name: "Inspired oxygen",
    prompt: "patient_state",
    description: "Whether the person breathes room air or receives extra oxygen.",
    dataType: null,
    cardinality: null,
    round1: [8, 8, 7, 9, 8, 7, 8, 8],
  },
  {
    name: "Probe site",
    prompt: "method",
    description: "Where the probe sits on the body.",
    dataType: null,
    cardinality: null,
    round1: [7, 8, 7, 7, 8, 7, 7, 8],
  },
  {
    name: "Device brand",
    prompt: "method",
    description: "The brand of the pulse oximeter.",
    dataType: null,
    cardinality: null,
    round1: [2, 1, 3, 2, 2, 3, 1, 2],
  },
];

async function startProject(
  db: Kysely<DB>,
  facilitatorId: string,
  name: string,
  scope: ScopeText,
  now: Date,
): Promise<Seeded> {
  const { projectId } = must(
    "create project",
    await createProject(db, facilitatorId, { name }, "en"),
  );
  must(
    "scope",
    await updateScope(db, facilitatorId, {
      projectId,
      concept: scope.concept,
      useCases: scope.useCases,
      outOfScope: scope.outOfScope,
    }),
  );
  for (const label of scope.sources) {
    must("scope source", await addScopeSource(db, facilitatorId, { projectId, label, url: null }));
  }
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
  return { projectId, raterIds };
}

async function nextPhase(
  db: Kysely<DB>,
  facilitatorId: string,
  projectId: string,
  from: ProjectPhase,
): Promise<void> {
  must(
    `phase after ${from}`,
    await movePhase(db, facilitatorId, { projectId, from, direction: "next" }),
  );
}

/** Adds the elements, the n-th by the n-th participant, with their proposed values. */
async function addElements(
  db: Kysely<DB>,
  facilitatorId: string,
  project: Seeded,
  elements: DemoElement[],
  source: (index: number) => string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, element] of elements.entries()) {
    const author = project.raterIds[index % project.raterIds.length] ?? facilitatorId;
    const { elementId } = must(
      `element ${element.name}`,
      await addElement(db, author, {
        projectId: project.projectId,
        name: element.name,
        description: element.description,
        dataType: element.dataType,
        cardinality: element.cardinality,
        source: source(index),
        prompt: element.prompt,
        reference: null,
      }),
    );
    if (element.values) {
      must(
        `values ${element.name}`,
        await setElementValues(db, facilitatorId, {
          projectId: project.projectId,
          elementId,
          values: element.values.map((text) => ({ text, value: null })),
        }),
      );
    }
    ids.push(elementId);
  }
  return ids;
}

/**
 * Opens a round on the facilitator's default element choice, rates it with the given scores per
 * element id and closes it, so its results exist.
 */
async function runClosedRound(
  db: Kysely<DB>,
  facilitatorId: string,
  project: Seeded,
  scores: Map<string, Scores>,
  reason: (elementId: string, score: number | null) => string | undefined,
  now: Date,
): Promise<string> {
  const { projectId } = project;
  const { roundId } = must(
    "create round",
    await createRound(
      db,
      facilitatorId,
      { projectId, closesAt: new Date(now.getTime() + ONE_DAY) },
      { now },
    ),
  );
  must("open round", await openRound(db, facilitatorId, { projectId, roundId }, { now }));
  for (const [elementId, perRater] of scores) {
    for (const [r, score] of perRater.entries()) {
      const raterId = project.raterIds[r];
      if (!raterId) continue;
      const why = reason(elementId, score);
      must(
        "rating",
        await saveRating(db, raterId, {
          projectId,
          roundId,
          elementId,
          score,
          ...(why === undefined ? {} : { reason: why }),
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
      .where("id", "=", roundId)
      .execute();
  });
  must("close round", await closeRound(db, facilitatorId, { projectId, roundId }, { now }));
  return roundId;
}

function scoresOf(elementIds: string[], elements: DemoElement[], round: "round1" | "round2") {
  const scores = new Map<string, Scores>();
  for (const [index, element] of elements.entries()) {
    const id = elementIds[index];
    const perRater = element[round];
    if (id && perRater) scores.set(id, perRater);
  }
  return scores;
}

/** Scope phase: a scope statement with comments from three participants. */
async function seedScope(db: Kysely<DB>, facilitatorId: string, now: Date): Promise<string> {
  const project = await startProject(
    db,
    facilitatorId,
    DEMO_PROJECTS.scope,
    {
      concept:
        "A measurement of the body temperature of a person, by any method and at any site of the body.",
      useCases: "Ward rounds; fever follow-up at home; screening at the emergency department.",
      outOfScope: "Continuous core temperature monitoring during surgery.",
      sources: ["Nursing observation chart of the demo hospital (invented)"],
    },
    now,
  );
  const comments = [
    "Do we include temperatures that the patient measures at home?",
    "The site of measurement changes the normal range; it should be part of the concept.",
    "Is a skin temperature from a screening camera the same concept?",
  ];
  for (const [index, body] of comments.entries()) {
    const author = project.raterIds[index * 3] ?? facilitatorId;
    must(
      "scope comment",
      await addScopeComment(db, author, { projectId: project.projectId, body }),
    );
  }
  return project.projectId;
}

/**
 * Discover phase, private step: the facilitator started from the pulse archetype, three
 * participants took the first look, five have brainstormed; the board is not revealed.
 */
async function seedDiscover(db: Kysely<DB>, facilitatorId: string, now: Date): Promise<string> {
  const project = await startProject(
    db,
    facilitatorId,
    DEMO_PROJECTS.discover,
    {
      concept: "The rate and rhythm of the heart beat of a person, counted or measured.",
      useCases: "Vital signs on the ward; triage; home monitoring.",
      outOfScope: "ECG interpretation.",
      sources: [],
    },
    now,
  );
  await nextPhase(db, facilitatorId, project.projectId, "scope");
  const { projectId } = project;
  must(
    "add archetype",
    await addCkmSource(db, storedCkm(), facilitatorId, { projectId, cid: DEMO_ARCHETYPE.cid }),
  );
  const coverage = must("coverage", await sourceCoverage(db, facilitatorId, { projectId }));
  const { createdElementIds } = must(
    "put on the list",
    await putOnList(db, facilitatorId, { projectId, rowIds: coverage.rows.map((row) => row.id) }),
  );
  for (const { by, count } of DEMO_FIRST_LOOK) {
    const raterId = project.raterIds[by];
    if (!raterId) continue;
    for (const [index, elementId] of createdElementIds.slice(0, count).entries()) {
      must(
        "first look",
        await answerFirstLook(db, raterId, {
          projectId,
          elementId,
          answer: FIRST_LOOK_CYCLE[(index + by) % FIRST_LOOK_CYCLE.length] ?? "belongs",
        }),
      );
    }
  }
  for (const { by, element } of DEMO_BRAINSTORM) {
    const author = project.raterIds[by] ?? facilitatorId;
    must(
      `brainstorm ${element.name}`,
      await addElement(db, author, {
        projectId: project.projectId,
        name: element.name,
        description: element.description,
        dataType: null,
        cardinality: null,
        source: "",
        prompt: element.prompt,
        reference: null,
      }),
    );
  }
  return project.projectId;
}

/** Decide phase: the blood pressure board, a closed round 1 and an open round 2. */
async function seedDecide(db: Kysely<DB>, facilitatorId: string, now: Date): Promise<string> {
  const project = await startProject(
    db,
    facilitatorId,
    DEMO_PROJECTS.decide,
    {
      concept:
        "The local measurement of the systemic arterial blood pressure of an adult, as recorded at the outpatient clinic and at home.",
      useCases:
        "Outpatient visit; home measurement reported by the patient; follow-up of hypertension treatment.",
      outOfScope: "Invasive (intra-arterial) pressure; 24-hour ambulatory monitoring summaries.",
      sources: [
        "openEHR CKM archetype openEHR-EHR-OBSERVATION.blood_pressure.v2",
        "Outpatient blood pressure form of the demo clinic (invented)",
      ],
    },
    now,
  );
  const { projectId, raterIds } = project;
  must(
    "scope comment",
    await addScopeComment(db, raterIds[0] ?? facilitatorId, {
      projectId,
      body: "Should home measurements by the patient be in scope from the start?",
    }),
  );
  await nextPhase(db, facilitatorId, projectId, "scope");
  const elementIds = await addElements(db, facilitatorId, project, DEMO_ELEMENTS, (index) =>
    index < 4 ? "Outpatient form" : "",
  );
  // The demo is past the brainstorm: the board is revealed, as a facilitator would (EL13).
  must("reveal board", await revealBoard(db, facilitatorId, projectId));
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
  await nextPhase(db, facilitatorId, projectId, "discover");
  await runClosedRound(
    db,
    facilitatorId,
    project,
    scoresOf(elementIds, DEMO_ELEMENTS, "round1"),
    (elementId, score) => {
      if (score === null) return "Outside my practice.";
      if (elementId === cuffSize && score <= 5) return "Hardly ever recorded in our clinic.";
      return undefined;
    },
    now,
  );
  // Round 2: the elements without consensus, open for a week, so participants can rate now.
  const round2 = must(
    "create round 2",
    await createRound(
      db,
      facilitatorId,
      { projectId, closesAt: new Date(now.getTime() + 7 * ONE_DAY) },
      { now },
    ),
  );
  must(
    "open round 2",
    await openRound(db, facilitatorId, { projectId, roundId: round2.roundId }, { now }),
  );
  return projectId;
}

/** Hand-off phase: two closed rounds, so the exports and results have content. */
async function seedHandoff(db: Kysely<DB>, facilitatorId: string, now: Date): Promise<string> {
  const project = await startProject(
    db,
    facilitatorId,
    DEMO_PROJECTS.handoff,
    {
      concept: "The breathing of a person, counted over a period of time.",
      useCases: "Vital signs on the ward; early warning scores; home monitoring.",
      outOfScope: "Measurements by a ventilator.",
      sources: ["Early warning score chart of the demo hospital (invented)"],
    },
    now,
  );
  const { projectId } = project;
  await nextPhase(db, facilitatorId, projectId, "scope");
  const elementIds = await addElements(db, facilitatorId, project, DEMO_HANDOFF_ELEMENTS, () => "");
  must("reveal board", await revealBoard(db, facilitatorId, projectId));
  await nextPhase(db, facilitatorId, projectId, "discover");
  const noReason = () => undefined;
  await runClosedRound(
    db,
    facilitatorId,
    project,
    scoresOf(elementIds, DEMO_HANDOFF_ELEMENTS, "round1"),
    noReason,
    now,
  );
  await runClosedRound(
    db,
    facilitatorId,
    project,
    scoresOf(elementIds, DEMO_HANDOFF_ELEMENTS, "round2"),
    noReason,
    now,
  );
  await nextPhase(db, facilitatorId, projectId, "decide");
  await nextPhase(db, facilitatorId, projectId, "detail");
  return projectId;
}

/**
 * Detail phase: three elements in the model. The facilitator's proposal for SpO2 is settled, and
 * the demo's one terminologist proposed its LOINC code; with no second terminologist, the
 * facilitator skipped the review and three participants agreed. An architect's proposal for the
 * inspired oxygen has one open objection; the probe site has none.
 */
async function seedDetail(db: Kysely<DB>, facilitatorId: string, now: Date): Promise<string> {
  const project = await startProject(
    db,
    facilitatorId,
    DEMO_PROJECTS.detail,
    {
      concept: "The oxygen saturation of arterial blood, measured by pulse oximetry.",
      useCases: "Vital signs on the ward; early warning scores; home monitoring of lung disease.",
      outOfScope: "Arterial blood gas analysis.",
      sources: ["Vital signs form of the demo hospital (invented)"],
    },
    now,
  );
  const { projectId, raterIds } = project;
  await nextPhase(db, facilitatorId, projectId, "scope");
  const elementIds = await addElements(db, facilitatorId, project, DEMO_DETAIL_ELEMENTS, () => "");
  const [spo2, oxygen] = elementIds;
  must("reveal board", await revealBoard(db, facilitatorId, projectId));
  await nextPhase(db, facilitatorId, projectId, "discover");
  await runClosedRound(
    db,
    facilitatorId,
    project,
    scoresOf(elementIds, DEMO_DETAIL_ELEMENTS, "round1"),
    () => undefined,
    now,
  );
  await nextPhase(db, facilitatorId, projectId, "decide");
  if (!spo2 || !oxygen) throw new Error("seed-demo: detail elements missing");

  const spo2Proposal = must(
    "propose SpO2",
    await proposeDetail(db, facilitatorId, {
      projectId,
      elementId: spo2,
      version: 0,
      dataType: "proportion",
      cardinality: { min: 1, max: 1 },
      values: [],
    }),
  );
  const oxygenProposal = must(
    "propose inspired oxygen",
    await proposeDetail(db, raterIds[6] ?? facilitatorId, {
      projectId,
      elementId: oxygen,
      version: 0,
      dataType: "coded_text",
      cardinality: { min: 0, max: 1 },
      values: [
        { text: "Room air", value: null },
        { text: "Supplemental oxygen", value: null },
      ],
    }),
  );
  for (const raterId of raterIds.slice(0, 5)) {
    must(
      "agree SpO2",
      await answerDetail(db, raterId, {
        projectId,
        proposalId: spo2Proposal.proposalId,
        version: spo2Proposal.version,
        answer: "agree",
        reason: null,
      }),
    );
  }
  must(
    "settle SpO2",
    await settleDetail(db, facilitatorId, {
      projectId,
      proposalId: spo2Proposal.proposalId,
      version: spo2Proposal.version,
    }),
  );
  // LOINC 59408-5: oxygen saturation in arterial blood by pulse oximetry (loinc.org/59408-5).
  const codes = must(
    "propose SpO2 codes",
    await proposeCodes(db, raterIds[5] ?? facilitatorId, {
      projectId,
      elementId: spo2,
      version: 0,
      code: {
        system: "http://loinc.org",
        code: "59408-5",
        display: "Oxygen saturation in Arterial blood by Pulse oximetry",
      },
      bindingStrength: null,
      valueSetUrl: null,
      valueCodes: [],
    }),
  );
  must(
    "skip SpO2 review",
    await skipReview(db, facilitatorId, {
      projectId,
      ...codes,
      reason: "The demo panel has one terminologist.",
    }),
  );
  for (const raterId of raterIds.slice(0, 3)) {
    must(
      "agree SpO2 codes",
      await answerDetail(db, raterId, {
        projectId,
        ...codes,
        answer: "agree",
        reason: null,
      }),
    );
  }
  for (const [index, raterId] of raterIds.slice(0, 4).entries()) {
    must(
      "answer inspired oxygen",
      await answerDetail(db, raterId, {
        projectId,
        proposalId: oxygenProposal.proposalId,
        version: oxygenProposal.version,
        answer: index === 0 ? "objection" : "agree",
        reason: index === 0 ? "We also record the flow rate in litres per minute." : null,
      }),
    );
  }
  return projectId;
}

const SEEDERS: Record<ProjectPhase, typeof seedScope> = {
  scope: seedScope,
  discover: seedDiscover,
  decide: seedDecide,
  detail: seedDetail,
  handoff: seedHandoff,
};

export interface SeededProject {
  phase: ProjectPhase;
  name: string;
  projectId: string;
  status: "seeded" | "already_seeded";
}

export interface SeedSummary {
  facilitator: string;
  participants: string[];
  projects: SeededProject[];
}

/** Seeds every demo project that does not exist yet; one that exists is left as it is. */
export async function seedDemo(
  db: Kysely<DB>,
  facilitatorEmail: string,
  now: Date = new Date(),
): Promise<SeedSummary> {
  const facilitatorId = await ensureUser(db, facilitatorEmail, "Demo facilitator");
  await grantAppRole(db, facilitatorEmail, "facilitator");
  await grantAppRole(db, facilitatorEmail, "administrator");

  const projects: SeededProject[] = [];
  for (const [phase, name] of Object.entries(DEMO_PROJECTS) as [ProjectPhase, string][]) {
    const existing = await db
      .selectFrom("organization")
      .select("id")
      .where("name", "=", name)
      .executeTakeFirst();
    if (existing) {
      projects.push({ phase, name, projectId: existing.id, status: "already_seeded" });
      continue;
    }
    const projectId = await SEEDERS[phase](db, facilitatorId, now);
    projects.push({ phase, name, projectId, status: "seeded" });
  }
  return {
    facilitator: normalizeEmail(facilitatorEmail),
    participants: DEMO_PARTICIPANTS.map((person) => person.email),
    projects,
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
    for (const project of summary.projects) {
      out(
        project.status === "seeded"
          ? `Seeded "${project.name}" (phase ${project.phase}).`
          : `"${project.name}" already exists; nothing changed.`,
      );
    }
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
