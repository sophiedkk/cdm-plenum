// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// EX3: the decision report of a project, built from the database on request, for the facilitator
// only. It names no person: groups are named by the rule of the ratings export (Q-PRIV-3, see
// rating-groups.ts), and no rating code, member or user id is read into the text.
import type { Kysely } from "kysely";
import type { Outcome } from "@/lib/consensus";
import { isDataTypeKey } from "@/lib/data-types";
import {
  type DecisionReport,
  type ReportElement,
  type ReportGroupRow,
  type ReportRound,
  writeDecisionReport,
} from "@/lib/decision-report";
import { ancestry } from "@/lib/model-tree";
import { EXPERT_TYPES } from "@/lib/panel";
import type { DB } from "../db/schema.gen.ts";
import { projectGroups } from "../details/tree.ts";
import { done, type ProjectResult, withProject } from "../projects/access.ts";
import { log } from "../projects/queries.ts";
import { invitedBy, responseRateOf } from "../rounds/results.ts";
import {
  kindOf,
  outcomesOf,
  type RoundRow,
  roundItems,
  statusOf,
  summaryOf,
} from "../rounds/round.ts";
import { modelTypeOf } from "../scope/queries.ts";
import {
  cardinality,
  codesStatuses,
  EXPORT,
  type ExportFile,
  elementRows,
  exportGroupName,
  fileDate,
  survivor,
  token,
} from "./queries.ts";
import { shownGroups } from "./rating-groups.ts";

// RFC 7763 registers text/markdown.
const MARKDOWN_MEDIA_TYPE = "text/markdown; charset=utf-8";

/** The groups with raters, named only when the rule allows, the rest merged into one row. */
function namedRows(
  rows: readonly {
    groupId: string;
    groupName: string;
    expertType: string;
    invited: number;
    started: number;
    completed: number;
  }[],
  members: ReadonlyMap<string, ReadonlySet<string>>,
): ReportGroupRow[] {
  const people = [...members].flatMap(([groupId, users]) =>
    [...users].map((code) => ({ code, groupId })),
  );
  const named = shownGroups(people);
  const shown: ReportGroupRow[] = [];
  const rest: ReportGroupRow = {
    name: null,
    expertType: null,
    invited: 0,
    started: 0,
    completed: 0,
  };
  let anyRest = false;
  for (const row of rows) {
    if (row.invited === 0 && row.started === 0) continue;
    if (named.has(row.groupId)) {
      shown.push({
        name: row.groupName,
        expertType: row.expertType,
        invited: row.invited,
        started: row.started,
        completed: row.completed,
      });
    } else {
      anyRest = true;
      rest.invited += row.invited;
      rest.started += row.started;
      rest.completed += row.completed;
    }
  }
  return anyRest ? [...shown, rest] : shown;
}

/** The panel and minimum the round stored when it opened (DE12); never its reason. */
function panelAtOpening(round: RoundRow): ReportRound["panel"] {
  const rows = EXPERT_TYPES.map((expertType) => ({
    expertType,
    raters: round[`panel_${expertType}`],
    minimum: round[`minimum_${expertType}`],
  }));
  return rows.every((row) => row.raters !== null && row.minimum !== null)
    ? rows.map((row) => ({ ...row, raters: row.raters ?? 0, minimum: row.minimum ?? 0 }))
    : null;
}

async function reportRound(
  trx: Kysely<DB>,
  projectId: string,
  round: RoundRow,
  now: Date,
): Promise<ReportRound> {
  const summary = summaryOf(round, now);
  const rate = await responseRateOf(trx, projectId, round, now);
  const members = await invitedBy(trx, projectId, round.closed_at ?? now);
  let items: ReportRound["items"] = [];
  if (round.closed_at !== null) {
    const outcomes = await outcomesOf(trx, round);
    items = (await roundItems(trx, round)).map((item) => {
      const result = outcomes.get(item.id)?.result;
      const outcome: Outcome = item.outcome ?? result?.outcome ?? "no_consensus";
      return {
        name: item.value ? `${item.value.elementName}: ${item.name}` : item.name,
        outcome,
        median: result?.median ?? null,
        rated: result?.rated ?? 0,
      };
    });
  }
  return {
    number: round.number,
    kind: kindOf(round),
    status: statusOf(round, now) as ReportRound["status"],
    rule: summary.rule,
    openedAt: summary.openedAt ?? "",
    closesAt: summary.closesAt,
    closedAt: summary.closedAt,
    groups: namedRows(rate.groups, members),
    panel: panelAtOpening(round),
    total: rate.total,
    items,
  };
}

/** The report's facts for a project; `now` is the cutoff of rounds that are still open. */
export async function decisionReportOf(
  db: Kysely<DB>,
  project: { id: string; name: string },
  now: Date,
): Promise<DecisionReport> {
  const scope = await db
    .selectFrom("scope_statement")
    .select(["concept", "use_cases", "out_of_scope"])
    .where("project_id", "=", project.id)
    .executeTakeFirst();

  const teams = await db
    .selectFrom("team")
    .select(["id", "name", "expert_type"])
    .where("organizationId", "=", project.id)
    .orderBy("name")
    .orderBy("id")
    .execute();
  const members = await invitedBy(db, project.id, now);
  const panel = namedRows(
    teams.map((team) => ({
      groupId: team.id,
      groupName: team.name,
      expertType: team.expert_type,
      invited: members.get(team.id)?.size ?? 0,
      started: 0,
      completed: 0,
    })),
    members,
  );

  const roundRows = await db
    .selectFrom("round")
    .selectAll()
    .where("project_id", "=", project.id)
    .where("opened_at", "is not", null)
    .orderBy("number")
    .execute();
  const rounds: ReportRound[] = [];
  for (const round of roundRows) rounds.push(await reportRound(db, project.id, round, now));

  const all = await elementRows(db, project.id);
  const byId = new Map(all.map((element) => [element.id, element]));
  const latestRows = await db
    .selectFrom("round_element")
    .innerJoin("round", "round.id", "round_element.round_id")
    .select(["round_element.element_id as elementId", "round_element.outcome"])
    .where("round.project_id", "=", project.id)
    .where("round.closed_at", "is not", null)
    .where("round_element.outcome", "is not", null)
    .orderBy("round.number")
    .execute();
  const latest = new Map(latestRows.map((row) => [row.elementId, row.outcome as Outcome]));
  const statuses = await codesStatuses(db, project.id);
  const groups = await projectGroups(db, project.id);
  const modelType = await modelTypeOf(db, project.id);
  const elements: ReportElement[] = all
    .filter((element) => element.mergedInto === null)
    .map((element) => {
      const path = element.groupId === null ? [] : ancestry(groups, element.groupId);
      const status = statuses.get(element.id);
      return {
        name: element.name,
        outcome: latest.get(element.id) ?? null,
        detail: {
          dataType:
            element.dataType !== null && isDataTypeKey(element.dataType) ? element.dataType : null,
          cardinality: cardinality(element),
          units: element.units,
          group:
            path.length === 0
              ? null
              : path.map((group) => exportGroupName(group, modelType)).join(" > "),
          code: token(element.codeSystem, element.code),
          codesSettled: status === undefined ? null : status === "settled",
        },
      };
    });
  const merged = all
    .filter((element) => element.mergedInto !== null)
    .flatMap((element) => {
      const into = survivor(byId, element);
      return into ? [{ name: element.name, into: into.name }] : [];
    });

  return {
    projectName: project.name,
    generatedOn: fileDate(now),
    scope: {
      concept: scope?.concept ?? "",
      useCases: scope?.use_cases ?? "",
      outOfScope: scope?.out_of_scope ?? "",
    },
    panel,
    rounds,
    elements,
    merged,
  };
}

/**
 * EX3: the decision report as a Markdown file: the scope statement, the panel per stakeholder
 * group, the consensus rule and response rate of each round and the outcome per element, in the
 * order of the ACCORD checklist (see `src/lib/decision-report.ts`).
 */
export async function exportDecisionReport(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  now = new Date(),
): Promise<ProjectResult<ExportFile>> {
  return withProject(db, userId, projectId, EXPORT, async (trx, project) => {
    const report = await decisionReportOf(trx, project, now);
    await log(trx, userId, project.id, "export_decision_report", "project", project.id);
    return done({
      filename: `decision-report-${fileDate(now)}.md`,
      mediaType: MARKDOWN_MEDIA_TYPE,
      content: writeDecisionReport(report),
    });
  });
}
