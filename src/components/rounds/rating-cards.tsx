// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The rating screen one element at a time (DE18): the shown card or the overview after the last
// card, "Previous", "Overview" and "Next" to move between them, and a dot per card that shows
// whether it is rated and links to it. N and P move to the next and the previous card. Moving
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

function dotName(element: MyElement, index: number): string {
  const { own, name } = element;
  if (!own.rated) return m.rounds_card_dot_not_rated({ index, name });
  if (own.score === null) return m.rounds_card_dot_unable({ index, name });
  return m.rounds_card_dot_rated({ index, name, score: own.score });
}

/**
 * A dot per card, filled when the element has an answer and open when not; the shown card's dot
 * is larger and ringed. Each dot links to its card and is named by the element and its answer.
 */
export function CardDots({
  elements,
  shown,
  cardLink,
}: Readonly<{ elements: readonly MyElement[]; shown: ShownCard; cardLink: CardLink }>) {
  return (
    <ol aria-label={m.rounds_card_dots_label()} className="flex flex-wrap items-center">
      {elements.map((element, position) => {
        const index = position + 1;
        const current = index === shown;
        const dot = element.own.rated ? "bg-primary" : "border-2 border-muted-foreground";
        return (
          <li key={element.id} className="flex">
            {cardLink(
              index,
              <>
                <span
                  aria-hidden="true"
                  data-rated={element.own.rated ? "" : undefined}
                  className={`rounded-full ${dot} ${current ? "size-3.5 ring-2 ring-foreground ring-offset-2 ring-offset-background" : "size-2.5"}`}
                />
                <span className="sr-only">{dotName(element, index)}</span>
              </>,
              "flex size-6 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              current,
            )}
          </li>
        );
      })}
    </ol>
  );
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
    progress: ReactNode,
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
        renderCard(
          element,
          { index: shown, total },
          headingRef,
          <CardDots elements={elements} shown={shown} cardLink={cardLink} />,
        )
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
