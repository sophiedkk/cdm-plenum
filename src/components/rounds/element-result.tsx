// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { m } from "@/i18n/messages";
// The result of one element (DE5): the outcome, the median, the share in the top and bottom
// band and the full distribution as a table whose count cells carry a bar. No chart library: the
// numbers are text, the bar only repeats them.
import type { ElementResult } from "@/lib/consensus";
import { formatNumber, formatPercent } from "./format";
import { OutcomeBadge } from "./round-badges";

/** The distribution of the scores as a table; each count has a bar of the same length. */
export function DistributionTable({
  result,
  caption,
}: Readonly<{ result: ElementResult; caption: string }>) {
  const largest = Math.max(1, ...result.distribution.map((row) => row.count));
  return (
    <table className="w-full max-w-md text-sm">
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

/** The figures of a result as a description list. */
export function ResultFigures({ result }: Readonly<{ result: ElementResult }>) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{m.rounds_result_median()}</dt>
      <dd>{result.median === null ? m.rounds_result_no_scores() : formatNumber(result.median)}</dd>
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

/** The result of one element with its outcome, for every member after the round closed. */
export function ElementResultView({
  name,
  outcome,
  result,
  groups,
  headingLevel = 3,
}: Readonly<{
  name: string;
  outcome: ElementResult["outcome"];
  result: ElementResult;
  groups: readonly { groupId: string; groupName: string; result: ElementResult }[];
  headingLevel?: 3 | 4;
}>) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <article className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Heading className="text-base font-semibold">{name}</Heading>
        <OutcomeBadge outcome={outcome} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ResultFigures result={result} />
        <DistributionTable result={result} caption={m.rounds_result_distribution({ name })} />
      </div>
      {groups.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            {m.rounds_result_groups_summary({ count: groups.length })}
          </summary>
          <div className="mt-4 flex flex-col gap-6">
            {groups.map((group) => (
              <section
                key={group.groupId}
                aria-label={group.groupName}
                className="flex flex-col gap-3 border-l-2 pl-4"
              >
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {group.groupName}
                  <OutcomeBadge outcome={group.result.outcome} />
                </p>
                <div className="grid gap-6 md:grid-cols-2">
                  <ResultFigures result={group.result} />
                  <DistributionTable
                    result={group.result}
                    caption={m.rounds_result_group_distribution({ name, group: group.groupName })}
                  />
                </div>
              </section>
            ))}
          </div>
        </details>
      )}
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">{m.rounds_result_no_groups()}</p>
      )}
    </article>
  );
}
