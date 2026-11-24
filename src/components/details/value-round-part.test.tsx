// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The value round line and button on a structure card (DT3): what each state of the round says,
// where the link points, and who gets the button to put the values in a round.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { DetailElement, DetailValueRound } from "@/lib/details";
import { ValueRoundPart } from "./value-round-part";

// The router's Link needs a router; the tests check where a link points.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    children,
  }: {
    params: { projectId: string; roundId: string };
    children: ReactNode;
  }) => <a href={`/projects/${params.projectId}/rounds/${params.roundId}`}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

function element(
  changes: {
    version?: number;
    settled?: boolean;
    values?: number;
    round?: DetailValueRound | null;
  } = {},
): DetailElement {
  const values = Array.from({ length: changes.values ?? 3 }, (_, index) => ({
    text: `Value ${index + 1}`,
    value: null,
  }));
  // Only the fields the part reads are filled.
  return {
    id: "e-1",
    name: "Severity",
    proposal: {
      id: "p-1",
      version: changes.version ?? 1,
      settledAt: changes.settled ? "2026-11-24T10:00:00.000Z" : null,
      structure: { dataType: "coded_text", cardinality: null, values },
    },
    valueRound: changes.round ?? null,
  } as unknown as DetailElement;
}

const ROUND = (changes: Partial<DetailValueRound> = {}): DetailValueRound => ({
  id: "r-3",
  number: 3,
  status: "open",
  version: 1,
  appliedVersion: null,
  ...changes,
});

type Options = {
  facilitator?: boolean;
  valueRounds?: { mayStart: boolean; draft: { id: string; number: number } | null } | null;
  add?: (proposalId: string) => Promise<void>;
  open?: boolean;
};

function show(el: DetailElement, options: Options = {}) {
  const add = options.add ?? vi.fn(async () => {});
  render(
    <ValueRoundPart
      projectId="p1"
      element={el}
      facilitator={options.facilitator ?? true}
      open={options.open ?? true}
      valueRounds={
        options.valueRounds === undefined ? { mayStart: true, draft: null } : options.valueRounds
      }
      add={add}
    />,
  );
  return add;
}

const READER: Options = { facilitator: false, valueRounds: null };

describe("ValueRoundPart", () => {
  it("offers the facilitator the button, and puts the values of the proposal in a round", async () => {
    const add = show(element());
    fireEvent.click(screen.getByRole("button", { name: /Rate the values in a round/ }));
    await waitFor(() => expect(add).toHaveBeenCalledWith("p-1"));
  });

  it("names the draft round the values would join", () => {
    show(element(), { valueRounds: { mayStart: true, draft: { id: "r-3", number: 3 } } });
    expect(screen.getByRole("button", { name: /Add the values to round 3/ })).toBeTruthy();
  });

  it.each<[string, Options, DetailElement]>([
    ["a participant", READER, element()],
    ["a closed step", { open: false }, element()],
    [
      "a value round that cannot start now",
      { valueRounds: { mayStart: false, draft: null } },
      element(),
    ],
    ["a settled proposal", {}, element({ settled: true })],
    ["a proposal without values (a reference element has none)", {}, element({ values: 0 })],
    ["values already in a round", {}, element({ round: ROUND() })],
  ])("offers no button for %s", (_name, options, el) => {
    show(el, options);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    ["draft", ROUND({ status: "draft" }), "The values wait in round 3, which is not open yet"],
    ["open", ROUND(), "The values are rated in round 3"],
    [
      "awaiting_close",
      ROUND({ status: "awaiting_close" }),
      "Round 3 with the values waits to be closed",
    ],
    ["closed", ROUND({ status: "closed" }), "Result of the values in round 3"],
  ])("says what a %s round holds and links to it", (_state, round, text) => {
    show(element({ round }), READER);
    expect(screen.getByRole("link", { name: text }).getAttribute("href")).toBe(
      "/projects/p1/rounds/r-3",
    );
  });

  it("says which version holds what the round kept, and says nothing once it is revised again", () => {
    const applied = ROUND({ status: "closed", appliedVersion: 2 });
    show(element({ version: 2, round: applied }), READER);
    expect(
      screen.getByRole("link", { name: "Version 2 holds the values round 3 kept" }),
    ).toBeTruthy();
    cleanup();
    show(element({ version: 3, round: applied }), READER);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says nothing of a closed round whose list was revised without applying it", () => {
    show(element({ version: 2, round: ROUND({ status: "closed" }) }), READER);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
