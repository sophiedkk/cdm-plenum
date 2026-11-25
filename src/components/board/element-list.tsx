// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { ChevronRightIcon, GitMergeIcon, LinkIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
// The participant's board (P8 of the UI/UX analysis of 2026-11-25): a list to read, not a table
// of columns that say nothing. Each element shows its name and its whole description; a signal
// shows only when it says something (more than one source, a CKM link, comments). The details,
// comments and marks open below the name, as in the facilitator's table.
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import { cn } from "@/lib/utils";
import { type CardElement, ElementDetails } from "./element-details";
import type { MarkTarget } from "./element-marks";
import { type ElementActions, elementMarks, markTarget, shortDataType } from "./element-table";
import { ReferenceText } from "./reference-text";

export interface ElementSignal {
  key: "type" | "cardinality" | "sources" | "ckm" | "merged" | "comments";
  label: string;
}

/** The facts of an element that say something; empty when none does. */
export function elementSignals(element: CardElement, detailFields: boolean): ElementSignal[] {
  const signals: ElementSignal[] = [];
  if (detailFields && element.reference === null) {
    if (element.dataType !== null || element.ckmLink !== null) {
      signals.push({ key: "type", label: shortDataType(element) });
    }
  }
  if (detailFields && element.cardinality !== null) {
    signals.push({ key: "cardinality", label: formatCardinality(element.cardinality) });
  }
  if (element.sources.length > 1) {
    signals.push({
      key: "sources",
      label: m.board_signal_sources({ count: element.sources.length }),
    });
  }
  if (element.ckmLink !== null) {
    signals.push({ key: "ckm", label: m.board_ckm_status_linked() });
  } else if (element.mergedCkmLinks.length > 0) {
    signals.push({ key: "merged", label: m.board_ckm_status_merged() });
  }
  if (element.commentCount > 0) {
    signals.push({
      key: "comments",
      label:
        element.commentCount === 1
          ? m.board_signal_comments_one()
          : m.board_signal_comments_many({ count: element.commentCount }),
    });
  }
  return signals;
}

function Signal({ signal }: Readonly<{ signal: ElementSignal }>) {
  if (signal.key === "ckm") return <StatusBadge tone="info" icon={LinkIcon} label={signal.label} />;
  if (signal.key === "merged") return <StatusBadge icon={GitMergeIcon} label={signal.label} />;
  return <>{signal.label}</>;
}

function ElementItem({
  projectId,
  element,
  position,
  detailFields,
  opened,
  actions,
  targets,
}: Readonly<{
  projectId: string;
  element: CardElement;
  position: number;
  detailFields: boolean;
  opened: boolean;
  actions: ElementActions;
  targets: readonly MarkTarget[];
}>) {
  const detailsId = `${useId()}details`;
  const [expanded, setExpanded] = useState(opened);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!opened) return;
    toggle.current?.scrollIntoView({ block: "center" });
    toggle.current?.focus({ preventScroll: true });
  }, [opened]);
  const { addComment } = actions;
  const signals = elementSignals(element, detailFields);

  return (
    <li className="flex flex-col gap-1 py-3">
      <Button
        ref={toggle}
        type="button"
        variant="ghost"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((shown) => !shown)}
        className="h-auto min-h-7 justify-start px-1 py-0.5 text-left whitespace-normal"
      >
        <ChevronRightIcon
          aria-hidden="true"
          data-icon="inline-start"
          className={cn("motion-safe:transition-transform", expanded && "rotate-90")}
        />
        <span className="font-semibold">
          <span aria-hidden="true" className="text-muted-foreground tabular-nums">
            {position}.{" "}
          </span>
          {element.name}
        </span>
      </Button>
      {element.reference && (
        <ReferenceText reference={element.reference} className="px-1 font-normal" />
      )}
      {element.description !== "" && (
        <p className="px-1 break-words whitespace-pre-wrap">{element.description}</p>
      )}
      {!expanded && signals.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-sm text-muted-foreground">
          {signals.map((signal) => (
            <li key={signal.key}>
              <Signal signal={signal} />
            </li>
          ))}
        </ul>
      )}
      <div id={detailsId} hidden={!expanded} className="pt-2">
        {expanded && (
          <section aria-label={m.board_details_label({ name: element.name })} className="px-1">
            <ElementDetails
              projectId={projectId}
              element={element}
              isFacilitator={false}
              canEdit={false}
              detailFields={detailFields}
              showDescription={false}
              addComment={addComment && ((body: string) => addComment(element, body))}
              onCommentAdded={() => actions.onCommentAdded(element)}
              onEdit={() => actions.onEdit(element)}
              onValues={() => actions.onValues(element)}
              onLink={() => actions.onLink(element)}
              marks={actions.marks && elementMarks(element, targets, actions.marks)}
            />
          </section>
        )}
      </div>
    </li>
  );
}

export function ElementList({
  projectId,
  elements,
  detailFields,
  openElementId,
  actions,
}: Readonly<{
  projectId: string;
  elements: readonly CardElement[];
  detailFields: boolean;
  /** The element whose details are open when the board loads. */
  openElementId?: string | undefined;
  actions: ElementActions;
}>) {
  const targets = elements.map((element, index) => markTarget(element, index + 1));
  return (
    <ol aria-label={m.board_list_label()} className="list-none divide-y border-y">
      {elements.map((element, index) => (
        <ElementItem
          key={element.id}
          projectId={projectId}
          element={element}
          position={index + 1}
          detailFields={detailFields}
          opened={element.id === openElementId}
          actions={actions}
          targets={targets}
        />
      ))}
    </ol>
  );
}
