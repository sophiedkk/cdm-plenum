// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The details of one element on the board (EL1, EL4, EL5, EL6, EL9): its description, fields,
// sources, CKM link and the links of merged duplicates, proposed values, comments and actions,
// and the member's own marks (EL16). The author shows only in the facilitator's view (EL2). Data
// type, cardinality and values show from the phase that decides them (EL21); the facilitator
// keeps the actions that set them in every phase.
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheetIcon,
  LightbulbIcon,
  LinkIcon,
  ListOrderedIcon,
  type LucideIcon,
  PencilIcon,
  VoteIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { type CommentOutcome, CommentThread } from "@/components/comments/comment-thread";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import { CODED_DATA_TYPE_KEYS } from "@/lib/data-types";
import { ELEMENT_COMMENT_MAX } from "@/lib/elements";
import { promptLabel, promptQuestion } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { BoardElement, ElementSourceKind } from "@/server/elements/queries";
import { elementCommentsQueryOptions } from "@/server/elements/query-options";
import type { Author } from "@/server/projects/member";
import { CkmLinks } from "./ckm-links";
import { dataTypeName, dataTypePair } from "./data-type-text";
import { type ElementMarkProps, ElementMarks } from "./element-marks";

export type CardElement = BoardElement & { author: Author | null };

const SOURCE_ICONS: Record<ElementSourceKind, LucideIcon> = {
  brainstorm: LightbulbIcon,
  csv: FileSpreadsheetIcon,
  ckm: LinkIcon,
  delphi: VoteIcon,
  fhir: LinkIcon,
  zib: LinkIcon,
};

/** A source in words; the label of a `delphi` source is the round number (DE16). */
const SOURCE_LABELS: Record<ElementSourceKind, (label: string) => string> = {
  brainstorm: (label) => withLabel(m.board_source_kind_brainstorm(), label),
  csv: (label) => withLabel(m.board_source_kind_csv(), label),
  ckm: (label) => withLabel(m.board_source_kind_ckm(), label),
  delphi: (label) => m.board_source_kind_delphi({ number: label }),
  fhir: (label) => withLabel(m.board_source_kind_fhir(), label),
  zib: (label) => withLabel(m.board_source_kind_zib(), label),
};

function withLabel(kind: string, label: string): string {
  return label === "" ? kind : `${kind}: ${label}`;
}

/** The data type as ADR 0009 shows it, or the RM type of a CKM link outside the list. */
export function dataTypeText(element: Pick<BoardElement, "dataType" | "ckmLink">): string {
  if (element.dataType !== null) {
    return `${dataTypeName(element.dataType)} (${dataTypePair(element.dataType)})`;
  }
  if (element.ckmLink !== null)
    return m.board_type_outside_list({ rmType: element.ckmLink.rmType });
  return m.board_not_decided();
}

/** Whether the element has a coded type, so it can have proposed values (EL9). */
export function isCoded(element: Pick<BoardElement, "dataType">): boolean {
  return element.dataType !== null && CODED_DATA_TYPE_KEYS.includes(element.dataType);
}

function Row({ term, children }: Readonly<{ term: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ElementDetails({
  projectId,
  element,
  isFacilitator,
  detailFields,
  addComment,
  onCommentAdded,
  onEdit,
  onValues,
  onLink,
  marks,
}: Readonly<{
  projectId: string;
  element: CardElement;
  isFacilitator: boolean;
  /** Whether the phase shows data type, cardinality and values (EL21). */
  detailFields: boolean;
  /** Left out when the phase closed comments on the board (PR9). */
  addComment?: ((body: string) => Promise<CommentOutcome>) | undefined;
  onCommentAdded: () => Promise<void> | void;
  onEdit: () => void;
  onValues: () => void;
  onLink: () => void;
  /** Left out when marks are closed: before the reveal or outside the discover phase (EL16). */
  marks?: ElementMarkProps | undefined;
}>) {
  const comments = useQuery(elementCommentsQueryOptions(projectId, element.id, isFacilitator));
  const coded = isCoded(element);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        {element.description !== "" && <p className="whitespace-pre-wrap">{element.description}</p>}
        <dl className="flex flex-col gap-2 text-sm">
          {detailFields ? (
            <>
              <Row term={m.board_field_data_type()}>{dataTypeText(element)}</Row>
              <Row term={m.board_field_cardinality()}>
                {element.cardinality === null
                  ? m.board_not_decided()
                  : formatCardinality(element.cardinality)}
              </Row>
            </>
          ) : (
            <Row term={m.board_column_question()}>
              {element.prompt === null ? promptLabel(null) : promptQuestion(element.prompt)}
            </Row>
          )}
          <Row term={m.board_field_sources()}>
            <ul className="flex flex-wrap gap-1">
              {element.sources.map((source, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: sources have no id and may repeat
                <li key={index}>
                  <StatusBadge
                    icon={SOURCE_ICONS[source.kind]}
                    label={SOURCE_LABELS[source.kind](source.label)}
                  />
                </li>
              ))}
            </ul>
          </Row>
          {(element.ckmLink !== null || element.mergedCkmLinks.length > 0) && (
            <Row term={m.board_field_ckm()}>
              <CkmLinks link={element.ckmLink} merged={element.mergedCkmLinks} />
            </Row>
          )}
          {detailFields && (coded || element.values.length > 0) && (
            <Row term={m.board_field_values()}>
              {element.values.length === 0 ? (
                m.board_values_empty()
              ) : (
                <ol className="list-decimal pl-5">
                  {element.values.map((value, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: values are an ordered list without ids
                    <li key={index}>
                      {value.text}
                      {value.value !== null && (
                        <span className="text-muted-foreground"> ({value.value})</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Row>
          )}
          {isFacilitator && (
            <Row term={m.board_field_author()}>
              {element.author === null
                ? m.board_author_left()
                : element.author.name.trim() || element.author.email}
            </Row>
          )}
        </dl>
        {isFacilitator && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <PencilIcon aria-hidden="true" data-icon="inline-start" />
              {m.board_edit()}
              <span className="sr-only">: {element.name}</span>
            </Button>
            {coded && (
              <Button type="button" variant="outline" size="sm" onClick={onValues}>
                <ListOrderedIcon aria-hidden="true" data-icon="inline-start" />
                {m.board_values_edit()}
                <span className="sr-only">: {element.name}</span>
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onLink}>
              <LinkIcon aria-hidden="true" data-icon="inline-start" />
              {m.board_link_ckm()}
              <span className="sr-only">: {element.name}</span>
            </Button>
          </div>
        )}
        {marks && <ElementMarks name={element.name} marks={marks} />}
      </div>
      <section aria-label={m.board_comments_label({ name: element.name })}>
        {comments.isPending && <p role="status">{m.common_loading()}</p>}
        {(comments.isError || (comments.data && !comments.data.ok)) && (
          <p role="alert" className="text-destructive">
            {comments.data && !comments.data.ok
              ? refusalMessage(comments.data.error)
              : m.common_error_unexpected()}
          </p>
        )}
        {comments.data?.ok && (
          <CommentThread
            comments={comments.data.value}
            max={ELEMENT_COMMENT_MAX}
            label={m.board_comments_label({ name: element.name })}
            add={addComment}
            onAdded={onCommentAdded}
          />
        )}
      </section>
    </div>
  );
}
