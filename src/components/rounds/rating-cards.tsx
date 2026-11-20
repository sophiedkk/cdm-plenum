// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The rating screen one element at a time (DE18): the shown card or the overview after the last
// card, and "Previous", "Overview" and "Next" to move between them. The card names its place as
// "Element N of M"; the overview lists every element with its answer and links to it. N and P move to the next and the previous card. Moving
// moves focus to the heading of what is shown, so a screen reader starts there and Tab continues
// from it. The route keeps the shown card in the URL; `cardLink` renders a link to a card.
import { ChevronLeftIcon, ChevronRightIcon, ListIcon } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { MyElement } from "@/server/rounds/ratings";
import { RatingOverview } from "./rating-overview";
import { useShortcuts } from "./shortcuts";

/** A card by its number from 1, or the overview after the last card. */
export type ShownCard = number | "overview";

/** A link to card `index`, or to the overview, around `children`; `current` marks the shown one. */
export type CardLink = (
  index: ShownCard,
  children: ReactNode,
  className?: string,
  current?: boolean,
) => ReactNode;

/** The card to show for a requested one: within the round, the overview when it has none. */
export function shownCard(requested: ShownCard | undefined, total: number): ShownCard {
  if (total === 0 || requested === "overview") return "overview";
  return Math.min(Math.max(requested ?? 1, 1), total);
}

export function RatingCards({
  number,
  elements,
  shown,
  cardLink,
  go,
  renderCard,
  afterOverview,
}: Readonly<{
  number: number;
  elements: readonly MyElement[];
  shown: ShownCard;
  cardLink: CardLink;
  /** Moves to card `index`, or to the overview, as following its link does. */
  go: (index: ShownCard) => void;
  renderCard: (
    element: MyElement,
    position: { index: number; total: number },
    headingRef: RefObject<HTMLHeadingElement | null>,
  ) => ReactNode;
  /** What follows the overview, such as the open question of round 1 (DE16). */
  afterOverview?: ReactNode;
}>) {
  const total = elements.length;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastShown = useRef(shown);
  useEffect(() => {
    // The first render keeps the focus where the browser puts it.
    if (lastShown.current === shown) return;
    lastShown.current = shown;
    headingRef.current?.focus();
  }, [shown]);

  const element = shown === "overview" ? undefined : elements[shown - 1];
  const previous: ShownCard | null = shown === "overview" ? total : shown > 1 ? shown - 1 : null;
  const next: ShownCard | null =
    shown === "overview" ? null : shown < total ? shown + 1 : "overview";

  useShortcuts((key) => {
    const target = key === "n" ? next : key === "p" ? previous : null;
    if (total === 0 || target === null) return false;
    go(target);
    return true;
  });

  return (
    <>
      {element && shown !== "overview" ? (
        renderCard(element, { index: shown, total }, headingRef)
      ) : (
        <RatingOverview
          number={number}
          elements={elements}
          headingRef={headingRef}
          cardLink={(index, name) => cardLink(index, name, "underline underline-offset-4")}
        />
      )}
      {total > 0 && (
        <nav
          aria-label={m.rounds_card_nav_label()}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          {previous === null ? (
            <Button type="button" variant="outline" disabled>
              <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
              {m.rounds_card_previous()}
            </Button>
          ) : (
            <Button asChild variant="outline">
              {cardLink(
                previous,
                <>
                  <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
                  {m.rounds_card_previous()}
                </>,
              )}
            </Button>
          )}
          {next !== null && (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="ghost">
                {cardLink(
                  "overview",
                  <>
                    <ListIcon aria-hidden="true" data-icon="inline-start" />
                    {m.rounds_card_to_overview()}
                  </>,
                )}
              </Button>
              <Button asChild>
                {cardLink(
                  next,
                  <>
                    {m.rounds_card_next()}
                    <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
                  </>,
                )}
              </Button>
            </div>
          )}
        </nav>
      )}
      {shown === "overview" && afterOverview}
    </>
  );
}
