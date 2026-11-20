// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Flagging a detail of an element while rating (DE17): a labelled reason that is required, a
// save, a change and a removal with focus kept on the flag's button, server refusals in words;
// and the facilitator's list of flags with names only when the round shows the raters (DE4).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { ElementFlags, OwnFlag } from "@/server/rounds/flags";
import type { DetailFlagKind } from "@/server/rounds/schemas";
import {
  DetailFlagList,
  type ElementDetails,
  ElementDetailsDisclosure,
  type FlagOutcome,
} from "./detail-flags";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const DETAILS: ElementDetails = {
  dataType: "DV_QUANTITY",
  cardinality: null,
  values: ["Left arm", "Right arm"],
};

/** The disclosure with the flags kept in state, as the rating screen keeps them in its cache. */
function Harness({
  initial = [],
  save,
  remove,
  editable = true,
}: Readonly<{
  initial?: OwnFlag[];
  save: (kind: DetailFlagKind, reason: string) => Promise<FlagOutcome>;
  remove: (kind: DetailFlagKind) => Promise<FlagOutcome>;
  editable?: boolean;
}>) {
  const [flags, setFlags] = useState(initial);
  return (
    <ElementDetailsDisclosure
      details={DETAILS}
      flags={flags}
      editable={editable}
      saveFlag={async (kind, reason) => {
        const outcome = await save(kind, reason);
        if (outcome.ok)
          setFlags((old) => [...old.filter((f) => f.kind !== kind), { kind, reason }]);
        return outcome;
      }}
      removeFlag={async (kind) => {
        const outcome = await remove(kind);
        if (outcome.ok) setFlags((old) => old.filter((f) => f.kind !== kind));
        return outcome;
      }}
    />
  );
}

const DONE = async (): Promise<FlagOutcome> => ({ ok: true });

describe("ElementDetailsDisclosure (DE17)", () => {
  it("shows each detail with its value, folded and marked not rated", () => {
    render(<Harness save={vi.fn(DONE)} remove={vi.fn(DONE)} />);
    const summary = screen.getByText("Data type, cardinality and values (not rated)");
    expect(summary.closest("details")?.open).toBe(false);
    const list = summary.closest("details")?.querySelector("dl");
    expect(list?.textContent).toContain("Data typeDV_QUANTITY");
    expect(list?.textContent).toContain("CardinalityNot chosen yet");
    expect(list?.textContent).toContain("ValuesLeft arm, Right arm");
  });

  it("asks for a reason, saves the flag and returns focus to its button", async () => {
    const save = vi.fn(DONE);
    render(<Harness save={save} remove={vi.fn(DONE)} />);
    fireEvent.click(screen.getByRole("button", { name: "Flag as wrong: data type" }));
    const reason = screen.getByLabelText("Why is the data type wrong?");
    expect(document.activeElement).toBe(reason);
    fireEvent.click(screen.getByRole("button", { name: "Save flag" }));
    expect(await screen.findByText("Give a reason.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: "  It is a count of cuffs  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save flag" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("data_type", "It is a count of cuffs"));
    expect(await screen.findByText("Your flag: It is a count of cuffs")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Flag saved");
    const change = screen.getByRole("button", { name: "Change flag: data type" });
    await waitFor(() => expect(document.activeElement).toBe(change));
    expect(
      screen.getByText("Data type, cardinality and values (not rated, flagged by you: 1)"),
    ).toBeTruthy();
  });

  it("refuses a reason longer than the server takes", async () => {
    const save = vi.fn(DONE);
    render(<Harness save={save} remove={vi.fn(DONE)} />);
    fireEvent.click(screen.getByRole("button", { name: "Flag as wrong: values" }));
    fireEvent.change(screen.getByLabelText("Why are the values wrong?"), {
      target: { value: "x".repeat(2001) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save flag" }));
    expect(await screen.findByText("Use at most 2000 characters.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("shows a refusal of the server in words and keeps the form open", async () => {
    const save = vi.fn(async (): Promise<FlagOutcome> => ({ ok: false, error: "round_not_open" }));
    render(<Harness save={save} remove={vi.fn(DONE)} />);
    fireEvent.click(screen.getByRole("button", { name: "Flag as wrong: cardinality" }));
    fireEvent.change(screen.getByLabelText("Why is the cardinality wrong?"), {
      target: { value: "It repeats" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save flag" }));
    expect(await screen.findByText("This round is not open.")).toBeTruthy();
    expect(screen.getByLabelText("Why is the cardinality wrong?")).toBeTruthy();
    expect(screen.queryByText("Your flag: It repeats")).toBeNull();
  });

  it("closes the form on cancel without saving, focus back on the flag button", async () => {
    const save = vi.fn(DONE);
    render(<Harness save={save} remove={vi.fn(DONE)} />);
    fireEvent.click(screen.getByRole("button", { name: "Flag as wrong: values" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const open = screen.getByRole("button", { name: "Flag as wrong: values" });
    await waitFor(() => expect(document.activeElement).toBe(open));
    expect(save).not.toHaveBeenCalled();
  });

  it("changes an existing flag with its reason filled in, and removes it", async () => {
    const save = vi.fn(DONE);
    const remove = vi.fn(DONE);
    render(
      <Harness initial={[{ kind: "values", reason: "No unit" }]} save={save} remove={remove} />,
    );
    expect(screen.getByText("Your flag: No unit")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change flag: values" }));
    const reason = screen.getByLabelText("Why are the values wrong?") as HTMLTextAreaElement;
    expect(reason.value).toBe("No unit");
    fireEvent.change(reason, { target: { value: "No unit and no range" } });
    fireEvent.click(screen.getByRole("button", { name: "Save flag" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("values", "No unit and no range"));
    fireEvent.click(await screen.findByRole("button", { name: "Remove flag: values" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("values"));
    expect(await screen.findByText("Flag removed")).toBeTruthy();
    expect(screen.queryByText(/Your flag:/)).toBeNull();
    const open = screen.getByRole("button", { name: "Flag as wrong: values" });
    await waitFor(() => expect(document.activeElement).toBe(open));
  });

  it("shows a refused removal in words", async () => {
    const remove = vi.fn(
      async (): Promise<FlagOutcome> => ({ ok: false, error: "element_not_in_round" }),
    );
    render(
      <Harness
        initial={[{ kind: "values", reason: "No unit" }]}
        save={vi.fn(DONE)}
        remove={remove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove flag: values" }));
    expect((await screen.findByRole("status")).textContent).not.toBe("");
    expect(screen.getByText("Your flag: No unit")).toBeTruthy();
  });

  it("offers no flag buttons once the round is not open", () => {
    render(
      <Harness
        initial={[{ kind: "values", reason: "No unit" }]}
        save={vi.fn(DONE)}
        remove={vi.fn(DONE)}
        editable={false}
      />,
    );
    expect(screen.getByText("Your flag: No unit")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});

const ELEMENTS = [
  { id: "e-1", name: "Systolic pressure" },
  { id: "e-2", name: "Cuff size" },
  { id: "e-3", name: "Position" },
];

const FLAGS: ElementFlags[] = [
  {
    elementId: "e-2",
    counts: { data_type: 2, cardinality: 0, values: 1 },
    flags: [
      { id: "f-1", kind: "data_type", reason: "A code, not text" },
      { id: "f-2", kind: "data_type", reason: "Coded text" },
      { id: "f-3", kind: "values", reason: "Missing child sizes" },
    ],
  },
];

describe("DetailFlagList (DE17)", () => {
  it("lists the flagged elements with the count per detail and every reason, without names", () => {
    render(<DetailFlagList elements={ELEMENTS} flags={FLAGS} />);
    const region = screen.getByRole("region", { name: "Flagged details (1)" });
    const items = within(region).getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Cuff size");
    expect(items[0]?.textContent).toContain("Data type: 2");
    expect(items[0]?.textContent).toContain("Values: 1");
    expect(items[0]?.textContent).not.toContain("Cardinality");
    expect(within(region).getByText("Data type: A code, not text")).toBeTruthy();
    expect(within(region).getByText("Values: Missing child sizes")).toBeTruthy();
    expect(region.textContent).not.toContain("Systolic pressure");
  });

  it("names who flagged what when the round shows the raters (DE4)", () => {
    const flaggers = new Map([
      ["f-1", "Invented Rater A"],
      ["f-2", "Invented Rater B"],
      ["f-3", "Invented Rater A"],
    ]);
    render(<DetailFlagList elements={ELEMENTS} flags={FLAGS} flaggers={flaggers} />);
    expect(screen.getByText("Data type: Coded text (Invented Rater B)")).toBeTruthy();
  });

  it("says when nobody flagged a detail", () => {
    render(<DetailFlagList elements={ELEMENTS} flags={[]} />);
    expect(screen.getByRole("region", { name: "Flagged details (0)" }).textContent).toContain(
      "No participant has flagged a detail.",
    );
  });
});
