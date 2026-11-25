// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The value lists of a value round (DT3): in a draft each list with a button that takes it out of
// the round, once the round is closed each list with what it kept and a button that applies the
// kept values to the proposal as a new version. Each list is headed by its element's name.
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { refusalMessage } from "@/lib/i18n/refusals";

/** One value list of the round as the screen shows it. */
export interface ValueListRow {
  proposalId: string;
  elementName: string;
  total: number;
  /** After closing: how many values the round kept. */
  kept?: number;
  /** The version applying made; null until applied. */
  appliedVersion?: number | null;
  /** Whether the proposal has a newer version than the round rated. */
  changed?: boolean;
}

/** What an action answers. */
export type ValueListOutcome = { ok: true } | { ok: false; error: string };

function Row({
  row,
  mode,
  act,
  canAct,
}: Readonly<{
  row: ValueListRow;
  canAct: boolean;
  mode: "draft" | "closed";
  act: (proposalId: string) => Promise<ValueListOutcome>;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kept = row.kept ?? row.total;
  const applied = row.appliedVersion ?? null;
  const unchanged = kept === row.total;
  const counts =
    mode === "draft"
      ? m.rounds_value_list_values({ count: row.total })
      : m.rounds_value_list_kept({ kept, total: row.total });
  // After closing, what became of the list: applied, outdated, or nothing to apply.
  const note =
    mode === "draft"
      ? null
      : applied !== null
        ? m.rounds_value_list_applied({ version: applied })
        : row.changed === true
          ? m.rounds_value_list_changed()
          : unchanged
            ? m.rounds_value_list_unchanged()
            : null;
  const mayAct = canAct && (mode === "draft" || (note === null && !unchanged));
  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium break-words">{row.elementName}</span>
          <span className="text-sm text-muted-foreground">{counts}</span>
          {note !== null && <span className="text-sm">{note}</span>}
        </div>
        {mayAct && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            aria-busy={busy}
            aria-label={`${mode === "draft" ? m.rounds_value_list_remove() : m.rounds_value_list_apply()}: ${row.elementName}`}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const outcome = await act(row.proposalId);
                if (!outcome.ok) setError(refusalMessage(outcome.error));
              } catch {
                setError(m.common_error_unexpected());
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === "draft" ? m.rounds_value_list_remove() : m.rounds_value_list_apply()}
          </Button>
        )}
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}

/** The value lists of a value round; `act` removes or applies one list. */
export function ValueLists({
  rows,
  mode,
  act,
  canAct = true,
}: Readonly<{
  /** Only the facilitator removes or applies a list; everyone else reads. */
  canAct?: boolean;
  rows: readonly ValueListRow[];
  mode: "draft" | "closed";
  act: (proposalId: string) => Promise<ValueListOutcome>;
}>) {
  return (
    <section aria-labelledby="value-lists-heading" className="flex max-w-3xl flex-col gap-2">
      <h3 id="value-lists-heading" className="type-section">
        {m.rounds_value_lists_heading()}
      </h3>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{m.rounds_value_lists_add()}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((row) => (
            <Row key={row.proposalId} row={row} mode={mode} act={act} canAct={canAct} />
          ))}
        </ul>
      )}
    </section>
  );
}
