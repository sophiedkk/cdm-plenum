// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The invite form (PR3): the group choice is a labelled field with its own error, and a refusal
// about the address shows at the address field.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { InviteForm } from "./invite-form";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const GROUPS = [{ id: "group-nursing", name: "Nursing", expertType: "clinical" }] as const;

describe("InviteForm", () => {
  it("shows the errors of an empty form at both fields and moves focus to the first", async () => {
    const invite = vi.fn();
    render(<InviteForm groups={GROUPS} invite={invite} onInvited={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(
      await screen.findByText("Enter an e-mail address such as name@example.org."),
    ).toBeTruthy();
    expect(screen.getByText("Choose the group the participant joins.")).toBeTruthy();
    const group = screen.getByLabelText("Stakeholder group");
    expect(group.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("E-mail address")),
    );
    expect(invite).not.toHaveBeenCalled();
  });

  it("speaks Dutch when the locale is Dutch", async () => {
    overwriteGetLocale(() => "nl");
    render(<InviteForm groups={GROUPS} invite={vi.fn()} onInvited={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Uitnodigen" }));
    expect(await screen.findByText("Kies de groep waar de deelnemer bij komt.")).toBeTruthy();
  });
});
