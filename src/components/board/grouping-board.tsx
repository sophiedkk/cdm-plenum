// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { PencilIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/members/form-dialog";
// The facilitator's grouping (EL18, ADR 0020): "Not grouped yet" beside the groups, each element
// a card. Drag a card onto a group with a mouse, a pen or a finger (pointer events), or click it,
// or press Enter on it, and choose "Move <name> here" in a group: the keyboard path (WCAG 2.1.1,
// 2.5.1). Escape puts a picked card down. A live region says what was picked up and moved.
import { useModelType } from "@/components/projects/model-type-context";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { groupName } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import { cn } from "@/lib/utils";
import type { GroupingBoard as Board, GroupedElement } from "@/server/elements/groups";
import { GroupNameForm } from "./group-name-form";

/** Where a card can go: a group by id, or "Not grouped yet". */
type Zone = string | "pool";
const POOL = "pool";

/** How far the pointer moves before a press becomes a drag, in CSS pixels. */
const DRAG_THRESHOLD = 6;

export interface GroupingActions {
  move: (elementId: string, groupId: string | null) => Promise<Outcome<unknown>>;
  rename: (groupId: string, name: string) => Promise<Outcome<unknown>>;
  onChanged: () => Promise<void> | void;
}

function ElementCard({
  element,
  held,
  elsewhere,
  onPick,
  onPointerDown,
}: Readonly<{
  element: GroupedElement;
  held: boolean;
  elsewhere: number;
  onPick: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}>) {
  return (
    <li>
      <button
        type="button"
        data-card={element.id}
        aria-pressed={held}
        onClick={onPick}
        onPointerDown={onPointerDown}
        className={cn(
          "inline-flex min-h-8 cursor-grab touch-pan-y items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-left text-sm shadow-xs select-none hover:border-foreground",
          held && "border-foreground bg-muted font-semibold",
        )}
      >
        {element.name}
        {elsewhere > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground">
            <span aria-hidden="true">{elsewhere}</span>
            <span className="sr-only">, {m.board_grouping_elsewhere({ count: elsewhere })}</span>
          </span>
        )}
      </button>
    </li>
  );
}

/** An element in the read view: its name as plain text, with the count of other groups. */
function ElementLine({
  element,
  elsewhere,
}: Readonly<{ element: GroupedElement; elsewhere: number }>) {
  return (
    <li>
      {element.name}
      {elsewhere > 0 && (
        <span className="ml-2 text-sm text-muted-foreground">
          {m.board_grouping_elsewhere({ count: elsewhere })}
        </span>
      )}
    </li>
  );
}

function MoveHere({ name, onMove }: Readonly<{ name: string; onMove: () => void }>) {
  return (
    <button
      type="button"
      onClick={onMove}
      className="mx-3 mt-0 mb-3 block w-[calc(100%-1.5rem)] rounded-md border border-dashed border-foreground bg-muted p-2 text-sm font-semibold"
    >
      {m.board_grouping_move_here({ name })}
    </button>
  );
}

function RenameGroup({
  label,
  current,
  rename,
  onRenamed,
}: Readonly<{
  label: string;
  current: string;
  rename: (name: string) => Promise<Outcome<unknown>>;
  onRenamed: (name: string) => Promise<void> | void;
}>) {
  return (
    <FormDialog
      title={m.board_grouping_rename_title()}
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
          <PencilIcon aria-hidden="true" />
        </Button>
      }
    >
      {({ close, cancel }) => (
        <GroupNameForm
          initial={current}
          submitLabel={m.board_grouping_save()}
          save={rename}
          cancel={cancel}
          onSaved={async (name) => {
            close();
            await onRenamed(name);
          }}
        />
      )}
    </FormDialog>
  );
}

export function GroupingBoard({
  board,
  actions,
  readOnly = false,
}: Readonly<{
  board: Board;
  actions: GroupingActions;
  /** The read view of a finished phase: no picking, dragging, moving or renaming; lists only. */
  readOnly?: boolean;
}>) {
  const modelType = useModelType();
  const [held, setHeld] = useState<GroupedElement | null>(null);
  const [over, setOver] = useState<Zone | null>(null);
  const [said, setSaid] = useState("");
  const [moved, setMoved] = useState<Record<string, Zone>>({});
  const drag = useRef<{
    element: GroupedElement;
    x: number;
    y: number;
    ghost: HTMLDivElement | null;
  } | null>(null);
  const dragged = useRef(false);
  const focusAfter = useRef<string | null>(null);

  // The server's grouping with the moves still on their way.
  const zoneOf = (id: string, server: Zone): Zone => moved[id] ?? server;
  const all: { element: GroupedElement; zone: Zone }[] = [
    ...board.ungrouped.map((element) => ({ element, zone: zoneOf(element.id, POOL) })),
    ...board.groups.flatMap((group) =>
      group.elements.map((element) => ({ element, zone: zoneOf(element.id, group.id) })),
    ),
  ];
  const inZone = (zone: Zone) =>
    all.filter((entry) => entry.zone === zone).map((entry) => entry.element);
  const nameOfZone = (zone: Zone) => {
    if (zone === POOL) return m.board_check_ungrouped();
    const group = board.groups.find((candidate) => candidate.id === zone);
    return group ? groupName(group, modelType) : "";
  };

  useEffect(() => {
    if (focusAfter.current === null) return;
    const card = document.querySelector<HTMLButtonElement>(
      `[data-card="${CSS.escape(focusAfter.current)}"]`,
    );
    card?.focus();
    focusAfter.current = null;
  });

  const forget = (id: string) =>
    setMoved((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

  // The newest move function, so the pointer listeners, added once, always use the current board.
  const moveRef = useRef<(element: GroupedElement, zone: Zone) => Promise<void>>(async () => {});
  moveRef.current = async (element, zone) => {
    setHeld(null);
    setOver(null);
    setMoved((current) => ({ ...current, [element.id]: zone }));
    focusAfter.current = element.id;
    try {
      const outcome = await actions.move(element.id, zone === POOL ? null : zone);
      if (!outcome.ok) {
        forget(element.id);
        toast.error(refusalMessage(outcome.error));
        return;
      }
      setSaid(m.board_grouping_moved({ name: element.name, group: nameOfZone(zone) }));
      await actions.onChanged();
      // The refreshed board holds the move now.
      forget(element.id);
    } catch {
      forget(element.id);
      toast.error(m.common_error_unexpected());
    }
  };

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const current = drag.current;
      if (!current) return;
      if (!current.ghost) {
        if (
          Math.abs(event.clientX - current.x) + Math.abs(event.clientY - current.y) <
          DRAG_THRESHOLD
        )
          return;
        const ghost = document.createElement("div");
        ghost.setAttribute("aria-hidden", "true");
        ghost.className =
          "pointer-events-none fixed z-50 rounded-md bg-primary px-2.5 py-1 text-sm text-primary-foreground shadow-lg";
        ghost.textContent = current.element.name;
        document.body.appendChild(ghost);
        current.ghost = ghost;
        dragged.current = true;
      }
      event.preventDefault();
      current.ghost.style.left = `${event.clientX + 8}px`;
      current.ghost.style.top = `${event.clientY + 8}px`;
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const zone = under?.closest<HTMLElement>("[data-zone]")?.dataset["zone"] ?? null;
      setOver(zone);
    }
    function onCancel() {
      const current = drag.current;
      drag.current = null;
      if (!current?.ghost) return;
      current.ghost.remove();
      setOver(null);
      setTimeout(() => {
        dragged.current = false;
      }, 0);
    }
    function onUp(event: PointerEvent) {
      const current = drag.current;
      drag.current = null;
      if (!current?.ghost) return;
      current.ghost.remove();
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const zone = under?.closest<HTMLElement>("[data-zone]")?.dataset["zone"];
      setOver(null);
      if (zone !== undefined) void moveRef.current(current.element, zone);
      // The click that follows the drop must not pick the card up.
      setTimeout(() => {
        dragged.current = false;
      }, 0);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setHeld(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function pick(element: GroupedElement) {
    if (dragged.current) return;
    const next = held?.id === element.id ? null : element;
    setHeld(next);
    setSaid(next === null ? "" : m.board_grouping_held({ name: element.name }));
  }

  function card(element: GroupedElement) {
    if (readOnly) {
      return (
        <ElementLine
          key={element.id}
          element={element}
          elsewhere={board.remarks.elsewhere[element.id] ?? 0}
        />
      );
    }
    return (
      <ElementCard
        key={element.id}
        element={element}
        held={held?.id === element.id}
        elsewhere={board.remarks.elsewhere[element.id] ?? 0}
        onPick={() => pick(element)}
        onPointerDown={(event) => {
          if (event.button > 0) return;
          drag.current = { element, x: event.clientX, y: event.clientY, ghost: null };
        }}
      />
    );
  }

  function moveHere(zone: Zone) {
    if (readOnly || held === null) return null;
    const from = all.find((entry) => entry.element.id === held.id)?.zone;
    if (from === zone) return null;
    return <MoveHere name={held.name} onMove={() => void moveRef.current(held, zone)} />;
  }

  const pool = inZone(POOL);
  // The read view lists the names one under the other; the working view shows chips to drag.
  const listClass = (extra: string) =>
    cn(extra, readOnly ? "flex flex-col gap-1" : "flex flex-wrap gap-1.5");
  return (
    <div className="grid items-start gap-6 md:grid-cols-[18.75rem_minmax(0,1fr)]">
      <section
        aria-labelledby="pool-heading"
        data-zone={POOL}
        className={cn(
          "rounded-lg border p-3 md:sticky md:top-4",
          over === POOL && "outline-2 outline-offset-2 outline-foreground outline-dashed",
        )}
      >
        <h3 id="pool-heading" className="text-[0.9375rem] font-semibold">
          {m.board_grouping_pool({ count: pool.length })}
        </h3>
        {pool.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{m.board_grouping_pool_empty()}</p>
        ) : (
          <ul className={listClass("mt-2")}>{pool.map(card)}</ul>
        )}
        {moveHere(POOL)}
      </section>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {board.groups.map((group) => {
          const items = inZone(group.id);
          const name = groupName(group, modelType);
          const missing = board.remarks.missing[group.id] ?? [];
          return (
            <section
              key={group.id}
              aria-labelledby={`group-${group.id}`}
              data-zone={group.id}
              className={cn(
                "min-h-40 rounded-lg border bg-card",
                over === group.id && "outline-2 outline-offset-2 outline-foreground outline-dashed",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <h3 id={`group-${group.id}`} className="text-[0.9375rem] font-semibold">
                  {name}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {items.length}
                  </span>
                </h3>
                {!readOnly && (
                  <RenameGroup
                    label={m.board_grouping_rename_named({ name })}
                    current={name}
                    rename={(next) => actions.rename(group.id, next)}
                    onRenamed={async (next) => {
                      toast.success(m.board_grouping_renamed({ name: next }));
                      await actions.onChanged();
                    }}
                  />
                )}
              </div>
              <ul
                className={cn(
                  listClass("min-h-24 content-start px-3 pt-2 pb-3"),
                  readOnly && "min-h-0",
                )}
              >
                {items.map(card)}
                {items.length === 0 && !readOnly && (
                  <li className="px-0.5 py-1 text-sm text-muted-foreground">
                    {m.board_grouping_drop_hint()}
                  </li>
                )}
              </ul>
              {moveHere(group.id)}
              {missing.length > 0 && (
                <div className="border-t px-3 py-2 text-sm">
                  <h4 className="font-semibold">{m.board_grouping_missing_title()}</h4>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {missing.map((body, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: remarks can repeat a text
                      <li key={index}>{body}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
