// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The comment thread (SC2, EL6): authors show only when the list carries them (EL2).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type CommentOutcome, CommentThread, type ThreadComment } from "./comment-thread";

afterEach(cleanup);

const AT = "2026-11-19T13:05:00.000Z";

function renderThread(
  comments: ThreadComment[],
  add: (body: string) => Promise<CommentOutcome> = vi.fn(async () => ({ ok: true }) as const),
) {
  const onAdded = vi.fn();
  render(
    <CommentThread comments={comments} max={20} label="Comments" add={add} onAdded={onAdded} />,
  );
  return { add, onAdded, submit: screen.getByRole("button", { name: "Add comment" }) };
}

describe("CommentThread", () => {
  it("shows the comments and a closed note, without a form, when the phase closed the step (PR9)", () => {
    render(
      <CommentThread
        comments={[{ id: "c1", body: "Too broad", createdAt: AT }]}
        max={20}
        label="Comments"
      />,
    );
    expect(screen.getByRole("list", { name: "Comments" }).textContent).toContain("Too broad");
    expect(screen.getByText(/This step is closed/)).toBeTruthy();
    expect(screen.queryByLabelText("Your comment")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add comment" })).toBeNull();
  });

  it("shows no author in a participant's list", () => {
    renderThread([{ id: "c1", body: "Too broad", createdAt: AT }]);
    const list = screen.getByRole("list", { name: "Comments" });
    expect(list.textContent).toContain("Too broad");
    expect(list.textContent).not.toMatch(/By /);
  });

  it("shows a participant their own comments as theirs and others' as a participant's", () => {
    renderThread([
      { id: "c1", body: "Mine", createdAt: AT, mine: true },
      { id: "c2", body: "Theirs", createdAt: AT, mine: false },
    ]);
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items[0]).toContain("By you");
    expect(items[1]).toContain("By a participant");
    expect(screen.queryByText(/former member/)).toBeNull();
  });

  it("names the time zone of a comment's moment, as the rounds do", () => {
    renderThread([{ id: "c1", body: "A", createdAt: AT }]);
    const time = screen.getByRole("list", { name: "Comments" }).querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe(AT);
    expect(time?.textContent).toMatch(/^November \d+, 2026.* \d{2}:\d{2} [A-Z][\w+:-]*$/);
  });

  it("shows the author, or a former member, in the facilitator's list", () => {
    renderThread([
      { id: "c1", body: "A", createdAt: AT, author: { name: "", email: "anna@example.test" } },
      { id: "c2", body: "B", createdAt: AT, author: null },
    ]);
    expect(screen.getByText(/By anna@example.test/)).toBeTruthy();
    expect(screen.getByText(/By a former member/)).toBeTruthy();
  });

  it("refuses an empty or too long comment before it calls the server", async () => {
    const { add, submit } = renderThread([], vi.fn());
    fireEvent.click(submit);
    expect(await screen.findByText("Write a comment first.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your comment"), { target: { value: "x".repeat(21) } });
    fireEvent.click(submit);
    expect(await screen.findByText("Use at most 20 characters.")).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });

  it("sends the trimmed comment, clears the field and shows a refusal", async () => {
    const add = vi
      .fn<(body: string) => Promise<CommentOutcome>>()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "element_not_found" });
    const { onAdded, submit } = renderThread([], add);
    const field = screen.getByLabelText("Your comment");
    fireEvent.change(field, { target: { value: " Fine " } });
    fireEvent.click(submit);
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(add).toHaveBeenCalledWith("Fine");
    expect(field).toHaveProperty("value", "");
    fireEvent.change(field, { target: { value: "Again" } });
    fireEvent.click(submit);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This element no longer exists",
    );
  });
});
