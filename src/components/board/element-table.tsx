// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { ChevronRightIcon, GitMergeIcon, LinkIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { CommentOutcome } from "@/components/comments/comment-thread";
// The compact board (Q-USE-1, ADR 0013): one table row per element, and a disclosure button on
// the name that opens the details in the row below. A table keeps the column headers, so a
// screen reader announces "Data type" or "Comments" with each value. Before the phase that
// decides them, the brainstorm question replaces data type, cardinality and CKM (EL21). A reference
// to another model names that model under its name and leaves the data type empty (EL26).
import { useModelType } from "@/components/projects/model-type-context";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import { FIRST_LOOK_ANSWERS, type FirstLookAnswer, type FirstLookCounts } from "@/lib/first-look";
import type { Outcome } from "@/lib/forms/outcome";
import { promptLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/utils";
import { dataTypeName } from "./data-type-text";
import { type CardElement, ElementDetails } from "./element-details";
import type { ElementMarkProps, MarkTarget } from "./element-marks";
import { ReferenceText } from "./reference-text";

/** The column headers of the first look's counts (EL22): one column per answer. */
const FIRST_LOOK_HEADERS: Record<FirstLookAnswer, () => string> = {
  belongs: () => m.board_column_first_look_belongs(),
  not_sure: () => m.board_column_first_look_not_sure(),
  not_belongs: () => m.board_column_first_look_not_belongs(),
};

/** The data type in a few words: its plain name, or the RM type of a CKM link outside the list. */
export function shortDataType(element: Pick<CardElement, "dataType" | "ckmLink">): string {
  if (element.dataType !== null) return dataTypeName(element.dataType);
  if (element.ckmLink !== null) return element.ckmLink.rmType;
  return m.board_not_decided();
}

function CkmStatus({ element }: Readonly<{ element: CardElement }>) {
  if (element.ckmLink !== null)
    return <StatusBadge tone="info" icon={LinkIcon} label={m.board_ckm_status_linked()} />;
  if (element.mergedCkmLinks.length > 0)
    return <StatusBadge icon={GitMergeIcon} label={m.board_ckm_status_merged()} />;
  return <span className="text-muted-foreground">{m.board_ckm_status_none()}</span>;
}

/** What the board does with one element; the table passes the element along. */
export interface ElementActions {
  /** Left out when the phase closed comments on the board (PR9). */
  addComment?: ((element: CardElement, body: string) => Promise<CommentOutcome>) | undefined;
  onCommentAdded: (element: CardElement) => Promise<void> | void;
  onEdit: (element: CardElement) => void;
  onValues: (element: CardElement) => void;
  onLink: (element: CardElement) => void;
  /** The member's own marks; left out when marks are closed (EL16). */
  marks?: BoardMarks | undefined;
}

/** The member's own "I support this" and "same as" marks on the board (EL16). */
export interface BoardMarks {
  supported: ReadonlySet<string>;
  sameAs: readonly { elementId: string; sameAsId: string }[];
  setSupport: (element: CardElement, supported: boolean) => Promise<Outcome<unknown>>;
  addSameAs: (element: CardElement, other: MarkTarget) => Promise<Outcome<unknown>>;
  removeSameAs: (element: CardElement, other: MarkTarget) => Promise<Outcome<unknown>>;
  onChanged: (message: string) => Promise<void> | void;
}

/** An element as the mark controls name it: its number on the board and its name. */
export function markTarget(
  element: Pick<CardElement, "id" | "name">,
  position: number,
): MarkTarget {
  return { id: element.id, name: `${position}. ${element.name}` };
}

function elementMarks(
  element: CardElement,
  targets: readonly MarkTarget[],
  marks: BoardMarks,
): ElementMarkProps {
  const others = new Set<string>();
  for (const pair of marks.sameAs) {
    if (pair.elementId === element.id) others.add(pair.sameAsId);
    if (pair.sameAsId === element.id) others.add(pair.elementId);
  }
  return {
    supported: marks.supported.has(element.id),
    sameAs: targets.filter((target) => others.has(target.id)),
    candidates: targets.filter((target) => target.id !== element.id),
    setSupport: (supported) => marks.setSupport(element, supported),
    addSameAs: (other) => marks.addSameAs(element, other),
    removeSameAs: (other) => marks.removeSameAs(element, other),
    onChanged: marks.onChanged,
  };
}

function ElementRows({
  projectId,
  element,
  position,
  isFacilitator,
  detailFields,
  ckmColumn,
  opened,
  actions,
  targets,
  supportCount,
  firstLook,
  columnCount,
}: Readonly<{
  projectId: string;
  element: CardElement;
  position: number;
  isFacilitator: boolean;
  detailFields: boolean;
  ckmColumn: boolean;
  targets: readonly MarkTarget[];
  /** The number of supporters, in the facilitator's view only (EL16). */
  supportCount: number | undefined;
  /** The first look's answers, in the facilitator's view during discover (EL22); null: none. */
  firstLook: FirstLookCounts | null | undefined;
  columnCount: number;
  /** Open on arrival, from a link to this element (EL15). */
  opened: boolean;
  actions: ElementActions;
}>) {
  const modelType = useModelType();
  const detailsId = `${useId()}details`;
  const [expanded, setExpanded] = useState(opened);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!opened) return;
    toggle.current?.scrollIntoView({ block: "center" });
    toggle.current?.focus({ preventScroll: true });
  }, [opened]);
  const { addComment } = actions;
  const notDecided = <span className="text-muted-foreground">{m.board_not_decided()}</span>;

  return (
    <>
      <TableRow>
        <TableCell className="text-muted-foreground tabular-nums">{position}</TableCell>
        <TableHead scope="row" className="h-auto min-w-40 py-1 whitespace-normal md:min-w-56">
          <Button
            ref={toggle}
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((shown) => !shown)}
            className="h-auto min-h-7 justify-start px-1 py-0.5 text-left text-sm whitespace-normal"
          >
            <ChevronRightIcon
              aria-hidden="true"
              data-icon="inline-start"
              className={cn("motion-safe:transition-transform", expanded && "rotate-90")}
            />
            {element.name}
          </Button>
          {element.reference && (
            <ReferenceText reference={element.reference} className="px-1 pb-1 font-normal" />
          )}
        </TableHead>
        <TableCell className="hidden w-full max-w-0 truncate text-muted-foreground md:table-cell">
          {element.description}
        </TableCell>
        {detailFields ? (
          <>
            <TableCell>
              {element.reference !== null
                ? null
                : element.dataType === null && element.ckmLink === null
                  ? notDecided
                  : shortDataType(element)}
            </TableCell>
            <TableCell className="tabular-nums">
              {element.cardinality === null ? notDecided : formatCardinality(element.cardinality)}
            </TableCell>
          </>
        ) : (
          <TableCell>{promptLabel(element.prompt, modelType)}</TableCell>
        )}
        <TableCell className="text-right tabular-nums">{element.sources.length}</TableCell>
        {ckmColumn && (
          <TableCell>
            <CkmStatus element={element} />
          </TableCell>
        )}
        <TableCell className="text-right tabular-nums">{element.commentCount}</TableCell>
        {supportCount !== undefined && (
          <TableCell className="text-right tabular-nums">{supportCount}</TableCell>
        )}
        {firstLook !== undefined &&
          FIRST_LOOK_ANSWERS.map((answer) => (
            <TableCell key={answer} className="text-right tabular-nums">
              {firstLook === null ? "" : firstLook[answer]}
            </TableCell>
          ))}
      </TableRow>
      <TableRow id={detailsId} hidden={!expanded} className="hover:bg-transparent">
        <TableCell colSpan={columnCount} className="px-4 pt-2 pb-6 whitespace-normal">
          {expanded && (
            // On a narrow screen the table scrolls sideways; the details stay within the screen.
            <section
              aria-label={m.board_details_label({ name: element.name })}
              className="sticky left-4 max-w-[calc(100vw-4rem)]"
            >
              <ElementDetails
                projectId={projectId}
                element={element}
                isFacilitator={isFacilitator}
                detailFields={detailFields}
                addComment={addComment && ((body: string) => addComment(element, body))}
                onCommentAdded={() => actions.onCommentAdded(element)}
                onEdit={() => actions.onEdit(element)}
                onValues={() => actions.onValues(element)}
                onLink={() => actions.onLink(element)}
                marks={actions.marks && elementMarks(element, targets, actions.marks)}
              />
            </section>
          )}
        </TableCell>
      </TableRow>
    </>
  );
}

export function ElementTable({
  projectId,
  elements,
  isFacilitator,
  detailFields,
  ckmColumn,
  openElementId,
  actions,
  supportCounts,
  firstLookCounts,
}: Readonly<{
  projectId: string;
  elements: readonly CardElement[];
  isFacilitator: boolean;
  /** Whether the phase shows data type, cardinality and values (EL21, `detailFieldsShown`). */
  detailFields: boolean;
  /** Whether the phase shows the CKM column (EX2, `ckmColumnShown`). */
  ckmColumn: boolean;
  /** The element whose details are open when the board loads. */
  openElementId?: string | undefined;
  actions: ElementActions;
  /** The supporters per element id; the facilitator's board shows them as a column (EL16). */
  supportCounts?: Readonly<Record<string, number>> | undefined;
  /** The first look's answers per element id; the facilitator's board in discover (EL22). */
  firstLookCounts?: Readonly<Record<string, FirstLookCounts>> | undefined;
}>) {
  const targets = elements.map((element, index) => markTarget(element, index + 1));
  const columnCount =
    6 +
    (detailFields ? 1 : 0) +
    (ckmColumn ? 1 : 0) +
    (supportCounts === undefined ? 0 : 1) +
    (firstLookCounts === undefined ? 0 : FIRST_LOOK_ANSWERS.length);
  return (
    <Table aria-label={m.board_list_label()}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">{m.board_column_number()}</TableHead>
          <TableHead scope="col">{m.board_name_label()}</TableHead>
          <TableHead scope="col" className="hidden md:table-cell">
            {m.board_description_label()}
          </TableHead>
          {detailFields ? (
            <>
              <TableHead scope="col">{m.board_field_data_type()}</TableHead>
              <TableHead scope="col">{m.board_field_cardinality()}</TableHead>
            </>
          ) : (
            <TableHead scope="col">{m.board_column_question()}</TableHead>
          )}
          <TableHead scope="col" className="text-right">
            {m.board_field_sources()}
          </TableHead>
          {ckmColumn && <TableHead scope="col">{m.board_field_ckm()}</TableHead>}
          <TableHead scope="col" className="text-right">
            {m.board_column_comments()}
          </TableHead>
          {supportCounts !== undefined && (
            <TableHead scope="col" className="text-right">
              {m.board_column_support()}
            </TableHead>
          )}
          {firstLookCounts !== undefined &&
            FIRST_LOOK_ANSWERS.map((answer) => (
              <TableHead key={answer} scope="col" className="text-right">
                {FIRST_LOOK_HEADERS[answer]()}
              </TableHead>
            ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {elements.map((element, index) => (
          <ElementRows
            key={element.id}
            projectId={projectId}
            element={element}
            position={index + 1}
            isFacilitator={isFacilitator}
            detailFields={detailFields}
            ckmColumn={ckmColumn}
            opened={element.id === openElementId}
            actions={actions}
            targets={targets}
            supportCount={
              supportCounts === undefined ? undefined : (supportCounts[element.id] ?? 0)
            }
            firstLook={
              firstLookCounts === undefined ? undefined : (firstLookCounts[element.id] ?? null)
            }
            columnCount={columnCount}
          />
        ))}
      </TableBody>
    </Table>
  );
}
