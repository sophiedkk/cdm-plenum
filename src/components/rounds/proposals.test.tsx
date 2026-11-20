// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The open question for missing elements at the end of round 1 (DE16) and the facilitator's
// list of proposals: labelled fields, the rule, the rater's own proposals with delete, server
// refusals in words, and the proposer named only when the round allows it (DE4).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { OwnProposal, RoundProposal } from "@/server/rounds/proposals";
import { ProposalList, type ProposalOutcome, ProposeSection } from "./proposals";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const MINE: OwnProposal[] = [
  { id: "p-1", name: "Body position", description: "Lying, sitting or standing" },
];

const DONE: ProposalOutcome = { ok: true };

function renderSection({
  add = vi.fn(async () => DONE),
  remove = vi.fn(async () => DONE),
  editable = true,
  proposals = MINE,
}: {
  add?: (name: string, description: string) => Promise<ProposalOutcome>;
  remove?: (id: string) => Promise<ProposalOutcome>;
  editable?: boolean;
  proposals?: OwnProposal[];
} = {}) {
  render(
    <ProposeSection
      rule="Proposed by at least two participants"
      proposals={proposals}
      editable={editable}
      add={add}
      remove={remove}
    />,
  );
  return { add, remove, region: screen.getByRole("region") };
}

describe("ProposeSection", () => {
  it("asks for missing elements, shows the rule and the rater's own proposals", () => {
    const { region } = renderSection();
    expect(screen.getByRole("region", { name: "Is an element missing? Propose it" })).toBe(region);
    expect(region.textContent).toContain(
      "Rule for adding proposed elements: Proposed by at least two participants",
    );
    expect(region.textContent).toContain("Your proposals (1)");
    expect(within(region).getByText("Body position")).toBeTruthy();
    expect(within(region).getByLabelText("Name of the element")).toBeTruthy();
    expect(within(region).getByLabelText("Description in one line (optional)")).toBeTruthy();
  });

  it("sends the trimmed name and description, then empties the form and says so", async () => {
    const { add } = renderSection();
    const name = screen.getByLabelText("Name of the element");
    fireEvent.change(name, { target: { value: "  Cuff location " } });
    fireEvent.change(screen.getByLabelText("Description in one line (optional)"), {
      target: { value: " Upper arm or wrist " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Propose element" }));
    await waitFor(() => expect(add).toHaveBeenCalledWith("Cuff location", "Upper arm or wrist"));
    expect(await screen.findByText("Proposal saved")).toBeTruthy();
    await waitFor(() => expect((name as HTMLInputElement).value).toBe(""));
  });

  it("refuses an empty name at the field and does not send", async () => {
    const { add } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Propose element" }));
    expect(await screen.findByText("Enter a name for the element.")).toBeTruthy();
    const name = screen.getByLabelText("Name of the element");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(add).not.toHaveBeenCalled();
  });

  it("shows a refusal of a closed round in words at the top of the form", async () => {
    renderSection({ add: vi.fn(async () => ({ ok: false, error: "round_not_open" }) as const) });
    fireEvent.change(screen.getByLabelText("Name of the element"), {
      target: { value: "Cuff location" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Propose element" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This round is not open.");
  });

  it("deletes an own proposal by a button named after it, and shows a refusal", async () => {
    const remove = vi.fn(async () => ({ ok: false, error: "proposal_not_found" }) as const);
    renderSection({ remove });
    fireEvent.click(screen.getByRole("button", { name: "Delete: Body position" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("p-1"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This proposal no longer exists.",
    );
  });

  it("shows the proposals without form or delete once the round is not open", () => {
    renderSection({ editable: false });
    expect(screen.getByText("Body position")).toBeTruthy();
    expect(screen.queryByLabelText("Name of the element")).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    renderSection({ proposals: [] });
    expect(
      screen.getByRole("heading", { name: "Mist er een element? Stel het voor" }),
    ).toBeTruthy();
    expect(screen.getByText("Je hebt nog geen element voorgesteld.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Element voorstellen" })).toBeTruthy();
  });
});

const PROPOSALS: RoundProposal[] = [
  { id: "p-1", name: "Body position", description: "Lying or sitting", elementId: null },
  { id: "p-2", name: "Cuff location", description: "", elementId: "e-9" },
];

describe("ProposalList", () => {
  it("lists the proposals with their count, without a proposer, and adds one to the board", async () => {
    const addToBoard = vi.fn(async () => DONE);
    render(<ProposalList proposals={PROPOSALS} addToBoard={addToBoard} />);
    const region = screen.getByRole("region", { name: "Proposed elements (2)" });
    expect(region.textContent).not.toContain("Proposed by");
    expect(within(region).getByText("On the board")).toBeTruthy();
    expect(within(region).queryByRole("button", { name: /Cuff location/ })).toBeNull();
    fireEvent.click(
      within(region).getByRole("button", { name: "Add to the board: Body position" }),
    );
    await waitFor(() => expect(addToBoard).toHaveBeenCalledWith(PROPOSALS[0]));
  });

  it("names the proposer when the round lets the facilitator see the raters", () => {
    render(
      <ProposalList
        proposals={PROPOSALS}
        proposers={new Map([["p-1", "Invented Nurse"]])}
        addToBoard={vi.fn(async () => DONE)}
      />,
    );
    expect(screen.getByText("Proposed by Invented Nurse")).toBeTruthy();
  });

  it("shows a refusal in words", async () => {
    render(
      <ProposalList
        proposals={PROPOSALS}
        addToBoard={vi.fn(async () => ({ ok: false, error: "proposal_already_on_board" }) as const)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to the board: Body position" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This proposal is already on the board.",
    );
  });

  it("says so when nobody has proposed an element", () => {
    render(<ProposalList proposals={[]} addToBoard={vi.fn(async () => DONE)} />);
    expect(screen.getByText("Nobody has proposed an element yet.")).toBeTruthy();
  });
});
