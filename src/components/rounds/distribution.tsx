// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The small distribution of one result (Q-USE-1, DE15): a bar per score on the scale, as an
// image whose name gives the counts in words, so the bars only repeat the text.
import { m } from "@/i18n/messages";
import { type ElementResult, MIN_GROUP_SCORES } from "@/lib/consensus";

/** The counts of a result in words, leaving out the scores nobody gave. */
export function distributionText(result: ElementResult): string {
  const given = result.distribution.filter((row) => row.count > 0);
  if (given.length === 0) return m.rounds_result_no_scores();
  return m.rounds_result_mini_label({
    counts: given
      .map((row) => m.rounds_result_mini_item({ score: row.score, count: row.count }))
      .join(", "),
  });
}

/** A bar per score, lowest first, about 6 rem wide; the image is named by its counts. */
export function MiniDistribution({ result }: Readonly<{ result: ElementResult }>) {
  const largest = Math.max(1, ...result.distribution.map((row) => row.count));
  return (
    <span
      role="img"
      aria-label={distributionText(result)}
      className="inline-flex h-6 w-24 shrink-0 items-end gap-px border-b border-muted-foreground"
    >
      {result.distribution.map((row) => (
        <span
          key={row.score}
          className="flex-1 rounded-t-[1px] bg-primary"
          style={{ height: `${(row.count / largest) * 100}%` }}
        />
      ))}
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
