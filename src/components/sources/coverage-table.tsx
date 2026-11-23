// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The coverage table of the existing models (EL20, ADR 0020): one row per candidate element, one
// column per model, a check per row and one button that puts the checked rows on the list. A row
// already on the list keeps its checked box, disabled, so no control moves after a save. A row
// matched by mapping or name is a suggestion: "Not the same" splits it into a row per element.
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { MatchBasis } from "@/lib/source-matching";
import type { Coverage, CoverageRowView, StoredSourceElement } from "@/server/sources/queries";

const BASIS_LABELS: Record<MatchBasis, () => string> = {
  code: () => m.board_models_basis_code(),
  mapping: () => m.board_models_basis_mapping(),
  name: () => m.board_models_basis_name(),
  none: () => m.board_models_basis_none(),
};

function rowName(row: CoverageRowView): string {
  return Object.values(row.cells)[0]?.[0]?.name ?? "";
}

/** What a model's element says about itself: its type and cardinality, as the source writes them. */
function cellDetail(element: StoredSourceElement): string {
  const occurs =
    element.min === null ? null : `${element.min}..${element.max === null ? "*" : element.max}`;
  return [element.type, occurs].filter((part) => part !== null && part !== "").join(" ");
}

/** A match the facilitator decides: by mapping or name, not yet on the list (EL20). */
function suggested(row: CoverageRowView): boolean {
  return !row.applied && row.basis !== "none" && !row.onList;
}

export function CoverageTable({
  coverage,
  putOnList,
  unmatch,
  onListed,
}: Readonly<{
  coverage: Coverage;
  putOnList: (rowIds: string[]) => Promise<Outcome<{ createdElementIds: string[] }>>;
  unmatch: (rowId: string) => Promise<Outcome<null>>;
  /** After rows were put on the list or split: reload the table. */
  onListed: () => Promise<void> | void;
}>) {
  const open = coverage.rows.filter((row) => !row.onList);
  // With one model nothing is matched, so the column would say "only one model" on every row.
  const showBasis = coverage.models.length > 1;
  // NOTE: ADR 0020 prototype: every row starts checked; the facilitator unchecks what is out.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const countId = useId();
  const chosen = open.filter((row) => !unchecked.has(row.id));

  function toggle(rowId: string, checked: boolean) {
    setUnchecked((current) => {
      const next = new Set(current);
      if (checked) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  async function submit() {
    setPending(true);
    try {
      const outcome = await putOnList(chosen.map((row) => row.id));
      if (outcome.ok) {
        const count = outcome.value.createdElementIds.length;
        toast.success(
          count === 1 ? m.board_models_listed_one() : m.board_models_listed_many({ count }),
        );
        setUnchecked(new Set());
        await onListed();
      } else {
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    } finally {
      setPending(false);
    }
  }

  async function split(row: CoverageRowView) {
    setPending(true);
    try {
      const outcome = await unmatch(row.id);
      if (outcome.ok) {
        toast.success(m.board_models_not_same_done());
        await onListed();
      } else {
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{m.board_models_coverage_title()}</caption>
          <thead>
            <tr className="bg-muted">
              <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                <span className="sr-only">{m.board_models_column_pick()}</span>
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                {m.board_models_column_element()}
              </th>
              {coverage.models.map((model) => (
                <th
                  key={model.id}
                  scope="col"
                  className="px-3 py-2.5 text-center font-semibold whitespace-nowrap"
                >
                  {model.title}
                </th>
              ))}
              {showBasis && (
                <th scope="col" className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                  {m.board_models_column_basis()}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {coverage.rows.map((row) => {
              const name = rowName(row);
              const boxId = `cover-${row.id}`;
              const models = Object.keys(row.cells).length;
              return (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2.5">
                    <Checkbox
                      id={boxId}
                      checked={row.onList || !unchecked.has(row.id)}
                      disabled={row.onList || pending}
                      onCheckedChange={(value) => toggle(row.id, value === true)}
                    />
                  </td>
                  <th scope="row" className="px-3 py-2.5 text-left font-normal">
                    <label htmlFor={boxId} className="flex flex-col">
                      <span>{name}</span>
                      {row.onList && (
                        <span className="text-xs text-muted-foreground">
                          {m.board_models_on_list()}
                        </span>
                      )}
                    </label>
                  </th>
                  {coverage.models.map((model) => {
                    const element = row.cells[model.id]?.[0];
                    return (
                      <td key={model.id} className="px-3 py-2.5 text-center whitespace-nowrap">
                        {element ? (
                          <span className="inline-flex flex-col items-center">
                            <span aria-hidden="true" className="font-semibold text-success">
                              ✓
                            </span>
                            <span className="sr-only">{m.board_models_has_it()}</span>
                            {element.name !== name && (
                              <span className="text-xs">{element.name}</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {cellDetail(element)}
                            </span>
                          </span>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-muted-foreground">
                              ·
                            </span>
                            <span className="sr-only">{m.board_models_lacks_it()}</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                  {showBasis && (
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                      <span className="flex flex-col items-start">
                        <span>{models > 1 ? BASIS_LABELS[row.basis]() : BASIS_LABELS.none()}</span>
                        {suggested(row) && (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto px-0"
                            aria-label={m.board_models_not_same_label({ name })}
                            disabled={pending}
                            onClick={() => void split(row)}
                          >
                            {m.board_models_not_same()}
                          </Button>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
        <span id={countId} aria-live="polite" className="text-sm">
          {open.length === 0
            ? m.board_models_all_listed()
            : m.board_models_chosen({ chosen: chosen.length, total: open.length })}
        </span>
        <Button
          type="button"
          disabled={pending || chosen.length === 0}
          aria-busy={pending}
          aria-describedby={countId}
          onClick={() => void submit()}
        >
          {m.board_models_put_on_list()}
        </Button>
      </div>
    </>
  );
}
