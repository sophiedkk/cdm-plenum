// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The small distribution of one result (Q-USE-1, DE15): a bar per score on the scale, as an
// image whose name gives the counts in words, so the bars only repeat the text.
import { m } from "@/i18n/messages";
import { type ElementResult, MIN_GROUP_SCORES } from "@/lib/consensus";

/** Whether `own` is a score that has a bar of its own in `result`. */
function hasOwnBar(result: ElementResult, own: number | null | undefined): own is number {
  return (
    typeof own === "number" && result.distribution.some((row) => row.score === own && row.count > 0)
  );
}

/**
 * The counts of a result in words, leaving out the scores nobody gave, and the participant's own
 * score when `own` is given.
 */
export function distributionText(result: ElementResult, own?: number | null): string {
  const given = result.distribution.filter((row) => row.count > 0);
  if (given.length === 0) return m.rounds_result_no_scores();
  const counts = m.rounds_result_mini_label({
    counts: given
      .map((row) => m.rounds_result_mini_item({ score: row.score, count: row.count }))
      .join(", "),
  });
  return hasOwnBar(result, own)
    ? `${counts}. ${m.rounds_result_mini_yours({ score: own })}`
    : counts;
}

/**
 * A bar per score, lowest first, about 6 rem wide; the image is named by its counts. With `own`,
 * the bar of the participant's own earlier score has an outline and a "you" label under it, as in
 * the COMET Handbook's round 2 example (Williamson et al. 2017, doi:10.1186/s13063-017-1978-4).
 */
export function MiniDistribution({
  result,
  own,
}: Readonly<{ result: ElementResult; own?: number | null }>) {
  const largest = Math.max(1, ...result.distribution.map((row) => row.count));
  const marked = hasOwnBar(result, own);
  const ownIndex = result.distribution.findIndex((row) => row.score === own);
  return (
    <span
      role="img"
      aria-label={distributionText(result, own)}
      className={`relative inline-flex h-6 w-24 shrink-0 items-end gap-px border-b border-muted-foreground ${marked ? "mb-3.5" : ""}`}
    >
      {result.distribution.map((row) => (
        <span
          key={row.score}
          data-own={marked && row.score === own ? "" : undefined}
          className="flex-1 rounded-t-[1px] bg-primary data-own:outline-2 data-own:outline-offset-1 data-own:outline-foreground"
          style={{ height: `${(row.count / largest) * 100}%` }}
        />
      ))}
      {marked && (
        // The label is drawn by CSS: the image's name already says it, and as text it would
        // join the group label next to the image.
        <span
          data-own-label={m.rounds_result_mini_you()}
          className="absolute top-full mt-0.5 -translate-x-1/2 type-meta leading-none after:content-[attr(data-own-label)]"
          style={{ left: `${((ownIndex + 0.5) / result.distribution.length) * 100}%` }}
        />
      )}
    </span>
  );
}

/**
 * The groups whose own result may be shown (Q-PRIV-3). The server already leaves out smaller
 * groups; the screen checks again so no change on either side shows a group below the minimum.
 */
export function shownGroups<T extends { result: ElementResult }>(groups: readonly T[]): T[] {
  return groups.filter((group) => group.result.rated >= MIN_GROUP_SCORES);
}
