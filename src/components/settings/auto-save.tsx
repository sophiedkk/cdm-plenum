// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A setting that applies when you change it (UI/UX analysis F7): the status next to the control
// says "Saved" politely, and a refusal or failure shows inline in words.
import { useRef, useState } from "react";
import { m } from "@/i18n/messages";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";

type AutoSaveState = { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };

type SaveResult = { ok: true } | { ok: false; error: RefusalCode };

/** Runs a save and keeps its status; `run` answers whether the save went through. */
export function useAutoSave() {
  const [state, setState] = useState<AutoSaveState>({ kind: "idle" });
  const latest = useRef(0);
  async function run(call: () => Promise<SaveResult>): Promise<boolean> {
    const mine = ++latest.current;
    const show = (next: AutoSaveState) => {
      if (mine === latest.current) setState(next);
    };
    try {
      const outcome = await call();
      show(
        outcome.ok ? { kind: "saved" } : { kind: "error", message: refusalMessage(outcome.error) },
      );
      return outcome.ok;
    } catch {
      show({ kind: "error", message: m.common_error_unexpected() });
      return false;
    }
  }
  return { state, run };
}

/**
 * The status line of a setting. Both regions stay in the page, so a screen reader announces the
 * text when it appears, and the line keeps its height.
 */
export function SaveStatus({ state }: Readonly<{ state: AutoSaveState }>) {
  return (
    <div className="min-h-5 text-sm">
      <p role="status" aria-live="polite" className="text-muted-foreground">
        {state.kind === "saved" ? m.common_saved() : ""}
      </p>
      <p role="alert" className="text-destructive">
        {state.kind === "error" ? state.message : ""}
      </p>
    </div>
  );
}
