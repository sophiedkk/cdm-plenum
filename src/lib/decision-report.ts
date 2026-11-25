// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The decision report of a project (EX3) as Markdown. The server collects the facts and applies
// the group-size rule (Q-PRIV-3); this file only orders and writes them, so the order of the
// parts can be tested without a database.
//
// NOTE: EX3 follows the ACCORD reporting guideline (Gattrell et al. 2024,
// https://doi.org/10.1371/journal.pmed.1004326, Table 4). Parts and items: title T1; aim and
// scope I2; panel M3, R3; method and rule M9, M11, M12; rounds R1, R3; outcomes R4, R5.
import type { ConsensusRule, Outcome } from "./consensus";

/** A stakeholder group the report may name, or the merged rest (Q-PRIV-3). */
export interface ReportGroupRow {
  /** Null for the merged row of groups that may not be named. */
  name: string | null;
  expertType: string | null;
  invited: number;
  started: number;
  completed: number;
}

export interface ReportRound {
  number: number;
  kind: "elements" | "values";
  status: "open" | "awaiting_close" | "closed";
  rule: ConsensusRule;
  openedAt: string;
  closesAt: string;
  closedAt: string | null;
  groups: ReportGroupRow[];
  /**
   * The panel per expert type when the round opened and the minimum that applied (DE12); null
   * for a round opened before the round stored them. The reason for opening below it is never
   * part of the report.
   */
  panel: { expertType: string; raters: number; minimum: number }[] | null;
  total: { invited: number; started: number; completed: number };
  /** The outcome per item; empty until the round has closed. */
  items: { name: string; outcome: Outcome; median: number | null; rated: number }[];
}

export interface ReportElement {
  name: string;
  /** The outcome of the last closed round that rated it; null when none did. */
  outcome: Outcome | null;
  detail: {
    dataType: string | null;
    cardinality: string | null;
    /** The allowed units of a quantity, the preferred first (DT1); empty for other types. */
    units: string[];
    group: string | null;
    code: string | null;
    /** Whether the proposed codes are settled; null when no code proposal exists (DT4). */
    codesSettled: boolean | null;
  };
}

export interface DecisionReport {
  projectName: string;
  generatedOn: string;
  scope: { concept: string; useCases: string; outOfScope: string };
  /** The raters per group now; the same naming rule as the rounds. */
  panel: ReportGroupRow[];
  rounds: ReportRound[];
  elements: ReportElement[];
  /** Names of elements merged into another, and the one they ended up in. */
  merged: { name: string; into: string }[];
}

export const OUTCOME_TEXT: Record<Outcome, string> = {
  included: "included",
  excluded: "excluded",
  no_consensus: "no consensus",
};

export const SMALL_GROUPS_TEXT = "Other groups (a group of fewer than 3 is not named)";

/** The smallest count the report writes as a number (Q-PRIV-3). */
const SMALLEST_NAMED_COUNT = 3;

/** A panel count for the report: 1 or 2 raters are "fewer than 3", so a group stays unnamed. */
export function panelCountText(count: number): string {
  return count > 0 && count < SMALLEST_NAMED_COUNT
    ? `fewer than ${SMALLEST_NAMED_COUNT}`
    : String(count);
}

/** One line of text for a table cell or list item: no line breaks, no pipe. */
function cell(text: string): string {
  return text.replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
}

function table(header: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

function paragraph(label: string, text: string): string {
  const trimmed = text.trim();
  return `**${label}:** ${trimmed === "" ? "not stated" : trimmed}`;
}

function groupName(row: ReportGroupRow): string {
  return row.name === null ? SMALL_GROUPS_TEXT : cell(row.name);
}

/** The rule in words: the scale, the two bands and the two percentages (M12). */
export function ruleText(rule: ConsensusRule): string {
  const top = `${rule.topBandMin} to ${rule.scaleMax}`;
  const bottom = `${rule.scaleMin} to ${rule.bottomBandMax}`;
  return (
    `Scores run from ${rule.scaleMin} to ${rule.scaleMax}. An item is included when at least ` +
    `${rule.agreementPct}% of the scores are ${top} and at most ${rule.oppositionPct}% are ` +
    `${bottom}. It is excluded when at least ${rule.agreementPct}% are ${bottom} and at most ` +
    `${rule.oppositionPct}% are ${top}. Otherwise there is no consensus.`
  );
}

const KIND_TEXT = {
  elements: "rating of the elements of the model",
  values: "rating of the proposed values of elements",
} as const;

function date(iso: string): string {
  return iso.slice(0, 10);
}

/** Writes the report in the order of the ACCORD checklist. */
export function writeDecisionReport(report: DecisionReport): string {
  const out: string[] = [];
  // T1: the title names the exercise and its method.
  out.push(
    `# Decision report: ${cell(report.projectName)} (consensus exercise, e-Delphi rating rounds)`,
  );
  out.push(`Generated on ${report.generatedOn}. The report names no person.`);

  // I2: the aim of the exercise.
  out.push("## Aim and scope");
  out.push(paragraph("Concept", report.scope.concept));
  out.push(paragraph("Use cases", report.scope.useCases));
  out.push(paragraph("Out of scope", report.scope.outOfScope));

  // M3, R3: who the panel is.
  out.push("## Panel");
  out.push(
    report.panel.length === 0
      ? "No participants have joined a stakeholder group."
      : table(
          ["Stakeholder group", "Expert type", "Raters"],
          report.panel.map((row) => [groupName(row), row.expertType ?? "", String(row.invited)]),
        ),
  );

  // M9, M11, M12: the steps and the rule of each.
  out.push("## Consensus method and rules");
  out.push(
    "The panel rated in rounds, anonymously: no participant sees who gave a rating. " +
      'A score of "unable to rate" counts as a response but not toward the percentages; ' +
      "this is our own design, no source consulted settles it.",
  );
  if (report.rounds.length === 0) out.push("No round has been opened.");
  for (const round of report.rounds) {
    out.push(`### Round ${round.number}`);
    out.push(`Objective: ${KIND_TEXT[round.kind]}. ${ruleText(round.rule)}`);
  }

  // R1, R3: when, and who took part.
  out.push("## Rounds and response");
  for (const round of report.rounds) {
    out.push(`### Round ${round.number}`);
    const closed = round.closedAt === null ? "not closed yet" : `closed ${date(round.closedAt)}`;
    out.push(
      `Opened ${date(round.openedAt)}, closing date ${date(round.closesAt)}, ${closed}. ` +
        `Of ${round.total.invited} invited, ${round.total.started} started and ` +
        `${round.total.completed} completed.`,
    );
    if (round.panel !== null) {
      out.push("Panel when the round opened, per expert type, and the minimum that applied:");
      out.push(
        table(
          ["Expert type", "Raters", "Minimum"],
          round.panel.map((row) => [
            cell(row.expertType),
            panelCountText(row.raters),
            String(row.minimum),
          ]),
        ),
      );
    }
    out.push(
      table(
        ["Stakeholder group", "Invited", "Started", "Completed"],
        round.groups.map((row) => [
          groupName(row),
          String(row.invited),
          String(row.started),
          String(row.completed),
        ]),
      ),
    );
  }
  if (report.rounds.length === 0) out.push("No round has been opened.");

  // R4: the outcome per round and per element.
  out.push("## Outcome per element");
  for (const round of report.rounds.filter((r) => r.status === "closed")) {
    out.push(`### Round ${round.number}`);
    out.push(
      table(
        ["Item", "Outcome", "Median", "Scores"],
        round.items.map((item) => [
          cell(item.name),
          OUTCOME_TEXT[item.outcome],
          item.median === null ? "" : String(item.median),
          String(item.rated),
        ]),
      ),
    );
  }
  out.push("### The model");
  out.push(
    table(
      ["Element", "Outcome", "Data type", "Cardinality", "Units", "Group", "Code"],
      report.elements.map((element) => [
        cell(element.name),
        element.outcome === null ? "not rated" : OUTCOME_TEXT[element.outcome],
        element.detail.dataType ?? "",
        element.detail.cardinality ?? "",
        cell(element.detail.units.join("; ")),
        cell(element.detail.group ?? ""),
        element.detail.code === null
          ? ""
          : `${cell(element.detail.code)}${element.detail.codesSettled === false ? " (open)" : ""}`,
      ]),
    ),
  );

  // R5: what was removed or changed along the way.
  out.push("## Items removed or changed");
  const excluded = report.rounds.flatMap((round) =>
    round.items
      .filter((item) => item.outcome === "excluded")
      .map((item) => `- ${cell(item.name)}: excluded in round ${round.number}.`),
  );
  const merged = report.merged.map((m) => `- ${cell(m.name)}: merged into ${cell(m.into)}.`);
  out.push([...excluded, ...merged].join("\n") || "None.");

  return `${out.join("\n\n")}\n`;
}
