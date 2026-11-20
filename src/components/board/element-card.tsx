// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One element on the board (EL1, EL4, EL5, EL6, EL9): its fields, sources, CKM link and the links
// of merged duplicates, proposed values and comments. The author shows only in the facilitator's
// view (EL2).
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheetIcon,
  LightbulbIcon,
  LinkIcon,
  ListOrderedIcon,
  type LucideIcon,
  MessageSquareIcon,
  PencilIcon,
  VoteIcon,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { type CommentOutcome, CommentThread } from "@/components/comments/comment-thread";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import { CODED_DATA_TYPE_KEYS } from "@/lib/data-types";
import { ELEMENT_COMMENT_MAX } from "@/lib/elements";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { BoardElement, ElementSourceKind } from "@/server/elements/queries";
import { elementCommentsQueryOptions } from "@/server/elements/query-options";
import type { Author } from "@/server/projects/member";
import { CkmLinks } from "./ckm-links";
import { dataTypeName, dataTypePair } from "./data-type-text";

export type CardElement = BoardElement & { author: Author | null };

const SOURCE_ICONS: Record<ElementSourceKind, LucideIcon> = {
  brainstorm: LightbulbIcon,
  csv: FileSpreadsheetIcon,
  ckm: LinkIcon,
  delphi: VoteIcon,
};

/** A source in words; the label of a `delphi` source is the round number (DE16). */
const SOURCE_LABELS: Record<ElementSourceKind, (label: string) => string> = {
  brainstorm: (label) => withLabel(m.board_source_kind_brainstorm(), label),
  csv: (label) => withLabel(m.board_source_kind_csv(), label),
  ckm: (label) => withLabel(m.board_source_kind_ckm(), label),
  delphi: (label) => m.board_source_kind_delphi({ number: label }),
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

function Row({ term, children }: Readonly<{ term: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ElementCard({
  projectId,
  element,
  position,
  isFacilitator,
  addComment,
  onCommentAdded,
  onEdit,
  onValues,
  onLink,
}: Readonly<{
  projectId: string;
  element: CardElement;
  position: number;
  isFacilitator: boolean;
  addComment: (body: string) => Promise<CommentOutcome>;
  onCommentAdded: () => Promise<void> | void;
  onEdit: () => void;
  onValues: () => void;
  onLink: () => void;
}>) {
  const base = useId();
  const headingId = `${base}name`;
  const commentsId = `${base}comments`;
  const [showComments, setShowComments] = useState(false);
  const comments = useQuery({
    ...elementCommentsQueryOptions(projectId, element.id, isFacilitator),
    enabled: showComments,
  });
  const coded = element.dataType !== null && CODED_DATA_TYPE_KEYS.includes(element.dataType);

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 id={headingId} className="text-base font-semibold">
        <span className="mr-2 text-muted-foreground">{position}.</span>
        {element.name}
      </h3>
      {element.description !== "" && <p className="whitespace-pre-wrap">{element.description}</p>}
      <dl className="flex flex-col gap-2 text-sm">
        <Row term={m.board_field_data_type()}>{dataTypeText(element)}</Row>
        <Row term={m.board_field_cardinality()}>
          {element.cardinality === null
            ? m.board_not_decided()
            : formatCardinality(element.cardinality)}
        </Row>
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
        {(coded || element.values.length > 0) && (
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
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={showComments}
          aria-controls={commentsId}
          onClick={() => setShowComments((shown) => !shown)}
        >
          <MessageSquareIcon aria-hidden="true" data-icon="inline-start" />
          {m.board_comments_toggle({ count: element.commentCount })}
          <span className="sr-only">: {element.name}</span>
        </Button>
        {isFacilitator && (
          <>
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
          </>
        )}
      </div>
      <div id={commentsId} hidden={!showComments}>
        {showComments && (
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
        )}
      </div>
    </article>
  );
}
