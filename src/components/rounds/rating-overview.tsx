// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The overview after the last rating card (DE18): every element with the participant's own
// rating, or "not rated yet", and the details they flagged while the phase shows details (EL21),
// each with a link back to its card.
import type { ReactNode, Ref } from "react";
import { m } from "@/i18n/messages";
import { groupName } from "@/lib/i18n/labels";
import type { MyElement, OwnRating } from "@/server/rounds/ratings";
import { detailLabel } from "./detail-flags";

function ratingText(own: OwnRating): string {
  if (!own.rated) return m.rounds_overview_not_rated();
  if (own.score === null) return m.rounds_rate_unable();
  return String(own.score);
}

/**
 * The heading of the group that starts at `index` (DE19), or null when the element before is
 * in the same group. Elements without a group come last, under "Not grouped".
 */
function headingBefore(elements: readonly MyElement[], index: number): string | null {
  const element = elements[index];
  if (!element) return null;
  const before = elements[index - 1];
  const id = element.group?.id ?? null;
  if (before !== undefined && (before.group?.id ?? null) === id) return null;
  if (element.group === null)
    return elements.some((other) => other.group !== null) ? m.board_check_ungrouped() : null;
  return groupName(element.group);
}

function GroupRows({
  heading,
  columns,
  children,
}: Readonly<{ heading: string | null; columns: number; children: ReactNode }>) {
  return (
    <>
      {heading !== null && (
        <tr className="bg-muted/30">
          <th scope="colgroup" colSpan={columns} className="px-3 py-1.5 text-left font-semibold">
            {heading}
          </th>
        </tr>
      )}
      {children}
    </>
  );
}

/** The table of the participant's ratings; `cardLink` renders the link to one card. */
export function RatingOverview({
  number,
  elements,
  flags,
  headingRef,
  cardLink,
}: Readonly<{
  number: number;
  elements: readonly MyElement[];
  /** Whether to list the flagged details (DE17). */
  flags: boolean;
  /** The heading, which takes focus when the participant moves to the overview. */
  headingRef?: Ref<HTMLHeadingElement>;
  cardLink: (index: number, name: string) => ReactNode;
}>) {
  return (
    <section aria-labelledby="rating-overview-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3
          id="rating-overview-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {m.rounds_overview_heading()}
        </h3>
        <p className="text-sm text-muted-foreground">{m.rounds_overview_intro()}</p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <caption className="sr-only">{m.rounds_overview_caption({ number })}</caption>
          <thead className="bg-muted/50 text-left">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {m.rounds_overview_element()}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {m.rounds_overview_rating()}
              </th>
              {flags && (
                <th scope="col" className="px-3 py-2 font-medium">
                  {m.rounds_overview_flags()}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {elements.map((element, index) => (
              <GroupRows
                key={element.id}
                heading={headingBefore(elements, index)}
                columns={flags ? 3 : 2}
              >
                <tr>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal break-words">
                    {cardLink(index + 1, element.name)}
                  </th>
                  <td
                    className={
                      element.own.rated ? "px-3 py-1.5" : "px-3 py-1.5 text-muted-foreground"
                    }
                  >
                    {ratingText(element.own)}
                  </td>
                  {flags && (
                    <td
                      className={
                        element.flags.length === 0
                          ? "px-3 py-1.5 text-muted-foreground"
                          : "px-3 py-1.5"
                      }
                    >
                      {element.flags.length === 0
                        ? m.rounds_overview_no_flags()
                        : element.flags.map((flag) => detailLabel(flag.kind)).join(", ")}
                    </td>
                  )}
                </tr>
              </GroupRows>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
