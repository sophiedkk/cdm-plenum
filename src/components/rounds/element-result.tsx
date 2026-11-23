// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The results of a closed round (DE5, Q-USE-1): one row per element with its outcome, median,
// a small distribution and the answers; "Details" opens the full distribution as a table and
// the result per stakeholder group (Q-PRIV-3). No chart library: the numbers are text, the bars
// only repeat them.
import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import type { ElementResult, Outcome } from "@/lib/consensus";
import type { RoundGroup } from "@/server/rounds/groups";
import type { GroupResult } from "@/server/rounds/round";
import { MiniDistribution, shownGroups } from "./distribution";
import { formatNumber, formatPercent } from "./format";
import { GroupRows, headingBefore } from "./group-rows";
import { OutcomeBadge } from "./round-badges";

/** The distribution of the scores as a table; each count has a bar of the same length. */
export function DistributionTable({
  result,
  caption,
}: Readonly<{ result: ElementResult; caption: string }>) {
  const largest = Math.max(1, ...result.distribution.map((row) => row.count));
  return (
    <table className="w-full max-w-md caption-top text-sm">
      <caption className="mb-1 text-left font-medium">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-16 py-1 text-left font-medium">
            {m.rounds_result_score()}
          </th>
          <th scope="col" className="py-1 text-left font-medium">
            {m.rounds_result_count()}
          </th>
        </tr>
      </thead>
      <tbody>
        {result.distribution.map((row) => (
          <tr key={row.score}>
            <th scope="row" className="py-0.5 text-left font-normal">
              {row.score}
            </th>
            <td className="py-0.5">
              <div className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className="h-3 rounded-sm bg-primary"
                  style={{ width: `${(row.count / largest) * 80}%` }}
                />
                <span>{row.count}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The median of a result, or "No scores". */
export function medianText(result: ElementResult): string {
  return result.median === null ? m.rounds_result_no_scores() : formatNumber(result.median);
}

/** The answers of a result in a few words: the scores and "unable to rate". */
export function answersText(result: ElementResult): string {
  return m.rounds_result_answers_short({ rated: result.rated, unable: result.unableToRate });
}

/** The figures of a result as a description list. */
export function ResultFigures({ result }: Readonly<{ result: ElementResult }>) {
  return (
    <dl className="grid content-start grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{m.rounds_result_median()}</dt>
      <dd>{medianText(result)}</dd>
      <dt className="text-muted-foreground">{m.rounds_result_top_band()}</dt>
      <dd>{formatPercent(result.topPct)}</dd>
      <dt className="text-muted-foreground">{m.rounds_result_bottom_band()}</dt>
      <dd>{formatPercent(result.bottomPct)}</dd>
      <dt className="text-muted-foreground">{m.rounds_result_responses()}</dt>
      <dd>
        {m.rounds_result_responses_value({
          rated: result.rated,
          unable: result.unableToRate,
        })}
      </dd>
    </dl>
  );
}

/**
 * The result per stakeholder group of one element as a compact table. Only groups with at
 * least 3 scores show (Q-PRIV-3); without any, a sentence says why. The outcome column is for a
 * closed round's results only, never on the rating screen (DE15).
 */
export function GroupResultsTable({
  name,
  groups,
  showOutcome,
}: Readonly<{ name: string; groups: readonly GroupResult[]; showOutcome: boolean }>) {
  const shown = shownGroups(groups);
  if (shown.length === 0) {
    return <p className="text-sm text-muted-foreground">{m.rounds_result_no_groups()}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-3xl caption-top text-sm">
        <caption className="mb-1 text-left font-medium">
          {m.rounds_result_groups_caption({ name })}
        </caption>
        <thead>
          <tr className="text-left">
            <th scope="col" className="py-1 pr-4 font-medium">
              {m.rounds_response_group()}
            </th>
            {showOutcome && (
              <th scope="col" className="py-1 pr-4 font-medium">
                {m.rounds_result_outcome()}
              </th>
            )}
            <th scope="col" className="py-1 pr-4 font-medium">
              {m.rounds_result_median()}
            </th>
            <th scope="col" className="py-1 pr-4 font-medium">
              {m.rounds_result_top_band()}
            </th>
            <th scope="col" className="py-1 pr-4 font-medium">
              {m.rounds_result_bottom_band()}
            </th>
            <th scope="col" className="py-1 pr-4 font-medium">
              {m.rounds_result_distribution_column()}
            </th>
            <th scope="col" className="py-1 font-medium">
              {m.rounds_result_responses()}
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((group) => (
            <tr key={group.groupId}>
              <th scope="row" className="py-1 pr-4 text-left font-normal">
                {group.groupName}
              </th>
              {showOutcome && (
                <td className="py-1 pr-4">
                  <OutcomeBadge outcome={group.result.outcome} />
                </td>
              )}
              <td className="py-1 pr-4">{medianText(group.result)}</td>
              <td className="py-1 pr-4">{formatPercent(group.result.topPct)}</td>
              <td className="py-1 pr-4">{formatPercent(group.result.bottomPct)}</td>
              <td className="py-1 pr-4">
                <MiniDistribution result={group.result} />
              </td>
              <td className="py-1 whitespace-nowrap">{answersText(group.result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface ResultRowElement {
  id: string;
  name: string;
  outcome: Outcome;
  result: ElementResult;
  groups: GroupResult[];
  /** The element's group of elements (EL18), for the headings (DE19). */
  group: RoundGroup | null;
}

const COLUMNS = 6;

function ResultRow({ element }: Readonly<{ element: ResultRowElement }>) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  return (
    <>
      <TableRow>
        <TableHead scope="row" className="font-medium whitespace-normal">
          {element.name}
        </TableHead>
        <TableCell>
          <OutcomeBadge outcome={element.outcome} />
        </TableCell>
        <TableCell>{medianText(element.result)}</TableCell>
        <TableCell>
          <MiniDistribution result={element.result} />
        </TableCell>
        <TableCell>{answersText(element.result)}</TableCell>
        <TableCell className="text-right">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={m.rounds_result_details_for({ name: element.name })}
            onClick={() => setOpen((value) => !value)}
          >
            {m.rounds_result_details()}
            <ChevronDownIcon
              aria-hidden="true"
              data-icon="inline-end"
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
            />
          </Button>
        </TableCell>
      </TableRow>
      <TableRow id={detailsId} hidden={!open} className="hover:bg-transparent">
        <TableCell colSpan={COLUMNS} className="whitespace-normal">
          {open && (
            <div className="flex flex-col gap-4 py-2">
              <div className="grid gap-6 md:grid-cols-2">
                <ResultFigures result={element.result} />
                <DistributionTable
                  result={element.result}
                  caption={m.rounds_result_distribution({ name: element.name })}
                />
              </div>
              <GroupResultsTable name={element.name} groups={element.groups} showOutcome />
            </div>
          )}
        </TableCell>
      </TableRow>
    </>
  );
}

/**
 * The results of a closed round, one row per element, for every member (DE5, Q-USE-1), under
 * the group headings in the order the server gives (DE19).
 */
export function ResultsTable({ elements }: Readonly<{ elements: readonly ResultRowElement[] }>) {
  return (
    <Table>
      <TableCaption className="sr-only">{m.rounds_results_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.rounds_result_element()}</TableHead>
          <TableHead scope="col">{m.rounds_result_outcome()}</TableHead>
          <TableHead scope="col">{m.rounds_result_median()}</TableHead>
          <TableHead scope="col">{m.rounds_result_distribution_column()}</TableHead>
          <TableHead scope="col">{m.rounds_result_responses()}</TableHead>
          <TableHead scope="col">
            <span className="sr-only">{m.rounds_result_details()}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {elements.map((element, index) => (
          <GroupRows key={element.id} columns={COLUMNS} heading={headingBefore(elements, index)}>
            <ResultRow element={element} />
          </GroupRows>
        ))}
      </TableBody>
    </Table>
  );
}
