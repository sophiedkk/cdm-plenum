// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The task bar of a participant's step page (P1 of the UI/UX analysis of 2026-11-25).
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { TaskBar } from "./task-bar";

// The router's Link needs a router; the tests check where a link points, not navigation.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params = {},
    children,
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
  }) => (
    <a href={Object.entries(params).reduce((path, [k, v]) => path.replace(`$${k}`, v), to)}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

describe("the task bar", () => {
  it("says the task and shows the progress in a status region", () => {
    render(
      <TaskBar
        projectId="p1"
        sentence="Answer each proposal: agree or object."
        progress={["1 of 3 answered"]}
      />,
    );
    expect(screen.getByText("Answer each proposal: agree or object.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("1 of 3 answered");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows several progress parts, each once", () => {
    render(
      <TaskBar projectId="p1" sentence="Task." progress={["1 of 3 answered", "2 to propose"]} />,
    );
    expect(screen.getAllByText(/answered|to propose/)).toHaveLength(2);
  });

  it("becomes the done state with what happens next and the way back", () => {
    render(
      <TaskBar
        projectId="p1"
        sentence="Answer each proposal: agree or object."
        progress={["3 of 3 answered"]}
        done={{ next: "The facilitator settles the proposals." }}
      />,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(
      "You are doneThe facilitator settles the proposals.3 of 3 answered",
    );
    expect(screen.getByRole("heading", { name: "You are done" })).toBeTruthy();
    // The sentence makes room for the done state; the count stays.
    expect(screen.queryByText("Answer each proposal: agree or object.")).toBeNull();
    expect(screen.getAllByText("3 of 3 answered")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Back to your task" }).getAttribute("href")).toBe(
      "/projects/p1",
    );
  });

  it("takes its own heading for a done state that has no sentence", () => {
    render(
      <TaskBar projectId="p1" done={{ title: "The model is agreed", next: "Read it below." }} />,
    );
    expect(screen.getByRole("heading", { name: "The model is agreed" })).toBeTruthy();
  });

  it("speaks Dutch", () => {
    overwriteGetLocale(() => "nl");
    render(<TaskBar projectId="p1" done={{ next: "De facilitator stelt de voorstellen vast." }} />);
    expect(screen.getByRole("heading", { name: "Je bent klaar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terug naar je taak" })).toBeTruthy();
  });
});
