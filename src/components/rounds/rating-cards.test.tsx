// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Rating one element per card (DE18): "Next" and "Previous" move between the cards, the last
// card leads to the overview of every rating with a link back to each card, and each move puts
// focus on the heading of what is shown. The route keeps the card in the URL; here a state
// stands in for it.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { DEFAULT_RULE } from "@/lib/consensus";
import type { MyElement } from "@/server/rounds/ratings";
import { RatingCards, type ShownCard, shownCard } from "./rating-cards";
import { RatingElement } from "./rating-element";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

function element(id: string, name: string, own: MyElement["own"]): MyElement {
  return { id, name, description: "", own, flags: [], previous: null };
}

const ELEMENTS: MyElement[] = [
  element("e-1", "Systolic pressure", { rated: true, score: 8, reason: null }),
  element("e-2", "Cuff size", { rated: true, score: null, reason: null }),
  element("e-3", "Position", { rated: false, score: null, reason: null }),
];

const DONE = async () => ({ ok: true }) as const;

function Harness({ start = 1 }: Readonly<{ start?: ShownCard }>) {
  const [shown, setShown] = useState<ShownCard>(start);
  return (
    <>
      <button type="button">Before the cards</button>
      <RatingCards
        number={1}
        elements={ELEMENTS}
        shown={shown}
        cardLink={(index: ShownCard, children: ReactNode, className?: string) => (
          <a
            href={`?card=${index}`}
            className={className}
            onClick={(event) => {
              event.preventDefault();
              setShown(index);
            }}
          >
            {children}
          </a>
        )}
        renderCard={(item, position, headingRef) => (
          <RatingElement
            key={item.id}
            element={item}
            details={{ dataType: null, cardinality: null, values: [] }}
            position={position}
            headingRef={headingRef}
            rule={DEFAULT_RULE}
            editable
            save={vi.fn(DONE)}
            clear={vi.fn(DONE)}
            saveFlag={vi.fn(DONE)}
            removeFlag={vi.fn(DONE)}
          />
        )}
        afterOverview={<p>The open question of round 1</p>}
      />
    </>
  );
}

const heading = (name: string) => screen.getByRole("heading", { level: 3, name });
const link = (name: string) => screen.getByRole("link", { name });

describe("RatingCards (DE18)", () => {
  it("shows one card with its place, and no Previous on the first", () => {
    render(<Harness />);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Systolic pressure" }).textContent).toContain(
      "Element 1 of 3",
    );
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    // The first render leaves the focus alone.
    expect(document.activeElement).toBe(document.body);
  });

  it("moves to the next and the previous card, with focus on the card heading", () => {
    render(<Harness />);
    fireEvent.click(link("Next"));
    expect(screen.getByRole("region", { name: "Cuff size" }).textContent).toContain(
      "Element 2 of 3",
    );
    expect(document.activeElement).toBe(heading("Cuff size"));
    fireEvent.click(link("Next"));
    expect(document.activeElement).toBe(heading("Position"));
    fireEvent.click(link("Previous"));
    expect(document.activeElement).toBe(heading("Cuff size"));
    expect(screen.queryByRole("region", { name: "Position" })).toBeNull();
  });

  it("leads from the last card to the overview of every rating", () => {
    render(<Harness start={3} />);
    expect(screen.queryByText("The open question of round 1")).toBeNull();
    fireEvent.click(link("Next"));
    const overview = screen.getByRole("region", { name: "Overview of your ratings" });
    expect(document.activeElement).toBe(heading("Overview of your ratings"));
    const rows = within(overview).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Systolic pressure8None",
      "Cuff sizeUnable to rateNone",
      "PositionNot rated yetNone",
    ]);
    expect(overview.textContent).toContain("2 of 3 elements rated");
    expect(screen.getByText("The open question of round 1")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
  });

  it("goes from the overview back to a card by its link, or to the last card", () => {
    render(<Harness start="overview" />);
    fireEvent.click(link("Cuff size"));
    expect(document.activeElement).toBe(heading("Cuff size"));
    fireEvent.click(link("Overview"));
    expect(document.activeElement).toBe(heading("Overview of your ratings"));
    fireEvent.click(link("Previous"));
    expect(document.activeElement).toBe(heading("Position"));
  });

  it("marks the details of every card as not rated", () => {
    render(<Harness />);
    for (const name of ["Systolic pressure", "Cuff size", "Position"]) {
      expect(
        within(screen.getByRole("region", { name })).getByText(
          "Data type, cardinality and values (not rated)",
        ),
      ).toBeTruthy();
      if (name !== "Position") fireEvent.click(link("Next"));
    }
  });
});

describe("shownCard", () => {
  it("keeps the requested card within the round and falls back to the first", () => {
    expect(shownCard(undefined, 3)).toBe(1);
    expect(shownCard(2, 3)).toBe(2);
    expect(shownCard(9, 3)).toBe(3);
    expect(shownCard("overview", 3)).toBe("overview");
    expect(shownCard(1, 0)).toBe("overview");
  });
});
