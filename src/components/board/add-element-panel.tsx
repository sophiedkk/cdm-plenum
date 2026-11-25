// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useEffect, useRef } from "react";
import { m } from "@/i18n/messages";

/**
 * The add form opened in the page below the "Add element" button (A2 of the UI/UX analysis of
 * 2026-11-25, GNOME HIG: inline before a dialog). Ticking "Refers to another model" only adds
 * fields below it, so nothing above moves. The name field takes the focus on open; the board
 * returns it to the button on close.
 */
export function AddElementPanel({ children }: Readonly<{ children: ReactNode }>) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.querySelector("input")?.focus();
  }, []);
  return (
    <section
      ref={panel}
      aria-label={m.board_add_title()}
      className="mb-6 flex max-w-2xl flex-col gap-4 rounded-lg border p-4"
    >
      <h3 className="text-lg font-semibold">{m.board_add_title()}</h3>
      <p className="text-muted-foreground">{m.board_add_description()}</p>
      {children}
    </section>
  );
}
