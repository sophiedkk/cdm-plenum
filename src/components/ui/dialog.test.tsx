// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The close button of a dialog carries a translated accessible name (Q-I18N-1, #21): no English
// "Close" in Dutch. Every form dialog hides it, so the name is tested here on the component.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

function renderDialog(showCloseButton = true) {
  render(
    <Dialog open>
      <DialogContent showCloseButton={showCloseButton}>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Text</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
}

describe("DialogContent", () => {
  it("names its close button in Dutch", () => {
    overwriteGetLocale(() => "nl");
    renderDialog();
    expect(screen.getByRole("button", { name: "Sluiten" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("names its close button in English", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("leaves the close button out when asked", () => {
    renderDialog(false);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
