// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The compact board (Q-USE-1, ADR 0013): one table row per element, and a disclosure button on
// the name that opens the details in the row below. A table keeps the column headers, so a
// screen reader announces "Data type" or "Comments" with each value.
import { ChevronRightIcon, GitMergeIcon, LinkIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { CommentOutcome } from "@/components/comments/comment-thread";
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
import { cn } from "@/lib/utils";
import { dataTypeName } from "./data-type-text";
import { type CardElement, ElementDetails } from "./element-details";

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
}

const COLUMN_COUNT = 8;

function ElementRows({
  projectId,
  element,
  position,
  isFacilitator,
  opened,
  actions,
}: Readonly<{
  projectId: string;
  element: CardElement;
  position: number;
  isFacilitator: boolean;
  /** Open on arrival, from a link to this element (EL15). */
  opened: boolean;
  actions: ElementActions;
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
        </TableHead>
        <TableCell className="hidden w-full max-w-0 truncate text-muted-foreground md:table-cell">
          {element.description}
        </TableCell>
        <TableCell>
          {element.dataType === null && element.ckmLink === null
            ? notDecided
            : shortDataType(element)}
        </TableCell>
        <TableCell className="tabular-nums">
          {element.cardinality === null ? notDecided : formatCardinality(element.cardinality)}
        </TableCell>
        <TableCell className="text-right tabular-nums">{element.sources.length}</TableCell>
        <TableCell>
          <CkmStatus element={element} />
        </TableCell>
        <TableCell className="text-right tabular-nums">{element.commentCount}</TableCell>
      </TableRow>
      <TableRow id={detailsId} hidden={!expanded} className="hover:bg-transparent">
        <TableCell colSpan={COLUMN_COUNT} className="px-4 pt-2 pb-6 whitespace-normal">
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
                addComment={addComment && ((body: string) => addComment(element, body))}
                onCommentAdded={() => actions.onCommentAdded(element)}
                onEdit={() => actions.onEdit(element)}
                onValues={() => actions.onValues(element)}
                onLink={() => actions.onLink(element)}
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
  openElementId,
  actions,
}: Readonly<{
  projectId: string;
  elements: readonly CardElement[];
  isFacilitator: boolean;
  /** The element whose details are open when the board loads. */
  openElementId?: string | undefined;
  actions: ElementActions;
}>) {
  return (
    <Table aria-label={m.board_list_label()}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">{m.board_column_number()}</TableHead>
          <TableHead scope="col">{m.board_name_label()}</TableHead>
          <TableHead scope="col" className="hidden md:table-cell">
            {m.board_description_label()}
          </TableHead>
          <TableHead scope="col">{m.board_field_data_type()}</TableHead>
          <TableHead scope="col">{m.board_field_cardinality()}</TableHead>
          <TableHead scope="col" className="text-right">
            {m.board_field_sources()}
          </TableHead>
          <TableHead scope="col">{m.board_field_ckm()}</TableHead>
          <TableHead scope="col" className="text-right">
            {m.board_column_comments()}
          </TableHead>
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
            opened={element.id === openElementId}
            actions={actions}
          />
        ))}
      </TableBody>
    </Table>
  );
}
