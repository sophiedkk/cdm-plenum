// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one menu per group (F6) and the removal with an Undo toast: Remove acts at once, the toast
// carries Undo, and Undo creates the group again; a refusal shows as an error toast.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "@/lib/forms/outcome";
import { GroupActions } from "./group-forms";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const GROUP = { id: "g1", name: "Nursing", expertType: "clinical" as const };
const OK: Outcome<null> = { ok: true, value: null };

function renderActions(remove: () => Promise<Outcome<unknown>>, restore = vi.fn(async () => OK)) {
  const onChanged = vi.fn();
  render(
    <GroupActions
      group={GROUP}
      rename={vi.fn(async () => OK)}
      onRenamed={vi.fn()}
      remove={remove}
      restore={restore}
      onChanged={onChanged}
    />,
  );
  return { restore, onChanged };
}

function openMenu() {
  // Radix opens the menu on a primary-button pointer down.
  fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Nursing" }), {
    button: 0,
    ctrlKey: false,
  });
}

describe("GroupActions", () => {
  it("holds Rename and Remove in one menu button", () => {
    renderActions(vi.fn(async () => OK));
    expect(screen.queryByRole("button", { name: /Remove|Rename/ })).toBeNull();
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeTruthy();
  });

  it("removes at once and offers Undo, which creates the group again", async () => {
    const remove = vi.fn(async () => OK);
    const { restore, onChanged } = renderActions(remove);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    const [message, options] = toast.success.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("The group Nursing is removed.");
    expect(options.action.label).toBe("Undo");
    expect(onChanged).toHaveBeenCalledTimes(1);

    options.action.onClick();
    await waitFor(() => expect(restore).toHaveBeenCalledOnce());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("The group Nursing is back."));
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("shows a refusal as an error and offers no Undo", async () => {
    renderActions(vi.fn(async () => ({ ok: false, error: "group_not_empty" }) as const));
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a taken name when Undo cannot create the group again", async () => {
    const restore = vi.fn(async () => ({ ok: false, error: "group_name_taken" }) as const);
    renderActions(
      vi.fn(async () => OK),
      restore,
    );
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    const [, options] = toast.success.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
  });
});
