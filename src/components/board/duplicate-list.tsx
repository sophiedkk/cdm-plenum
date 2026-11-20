// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's list of possible duplicates (EL16): the pairs members marked as the same,
// with the number of marks and no names (Q-ANON-1). A disclosure keeps the board compact
// (Q-USE-1); each pair opens the merge with both elements chosen (EL5).
import { ChevronRightIcon, CombineIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import type { MarkTarget } from "./element-marks";

/** A proposed pair, its elements in board order, with the number of members who marked it. */
export interface DuplicatePair {
  first: MarkTarget;
  second: MarkTarget;
  count: number;
}

export function DuplicateList({
  pairs,
  onMerge,
}: Readonly<{
  pairs: readonly DuplicatePair[];
  /** Opens the merge with `first` as the element to keep and `second` as the duplicate. */
  onMerge: (pair: DuplicatePair) => void;
}>) {
  const listId = `${useId()}duplicates`;
  const [expanded, setExpanded] = useState(false);
  if (pairs.length === 0) return null;
  return (
    <section aria-label={m.board_duplicates_title({ count: pairs.length })} className="mb-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((shown) => !shown)}
        className="px-1"
      >
        <ChevronRightIcon
          aria-hidden="true"
          data-icon="inline-start"
          className={cn("motion-safe:transition-transform", expanded && "rotate-90")}
        />
        {m.board_duplicates_title({ count: pairs.length })}
      </Button>
      <div
        id={listId}
        hidden={!expanded}
        className="mt-2 flex flex-col gap-2 rounded-lg border p-3"
      >
        <p className="text-sm text-muted-foreground">{m.board_duplicates_help()}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {pairs.map((pair) => {
            const names = m.board_duplicates_pair({
              first: pair.first.name,
              second: pair.second.name,
            });
            return (
              <li
                key={`${pair.first.id} ${pair.second.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span className="font-medium">{names}</span>
                <span className="text-muted-foreground tabular-nums">
                  {m.board_duplicates_count({ count: pair.count })}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => onMerge(pair)}>
                  <CombineIcon aria-hidden="true" data-icon="inline-start" />
                  {m.board_duplicates_merge()}
                  <span className="sr-only">: {names}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
