// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The comments under the scope (SC2) and under an element (EL6): the list, oldest first, and a
// form to add one. The author's name shows only when the list carries one: the facilitator's
// queries do (EL2, ADR 0005) and every query of a Team project (PR14); a Delphi participant's
// list says only which comments are their own. Without `add` the step is closed (PR9): a note takes the form's place.
import { revalidateLogic } from "@tanstack/react-form";
import { useRef } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { DateTime } from "@/components/status/date-time";
import { StepClosedNote } from "@/components/status/step-closed-note";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";

export interface ThreadComment {
  id: string;
  body: string;
  createdAt: string;
  /**
   * Set in the facilitator's list and in a Team project (PR14); null there when the author left
   * the project. Only the facilitator's list carries the address.
   */
  author?: { name: string; email?: string } | null;
  /** Set in a participant's list only: whether the reader wrote it. */
  mine?: boolean;
}

/**
 * The name of a person as the screens show it. Only the facilitator's lists carry an address, as
 * the fallback; anyone else gets a neutral label for a person without a name.
 */
export function authorName(author: { name: string; email?: string }): string {
  return author.name.trim() || author.email || m.common_author_unnamed();
}

export type CommentOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The limits of `addScopeCommentInput` and `addElementCommentInput`, with translated messages. */
export function commentSchema(max: number) {
  return z.object({
    body: z
      .string()
      .trim()
      .min(1, { error: () => m.common_comment_required() })
      .max(max, { error: () => m.common_comment_too_long({ max }) }),
  });
}

function authorText({ author, mine }: ThreadComment): string | null {
  if (author === null) return m.common_comment_author_left();
  if (author !== undefined) return m.common_comment_author({ name: authorName(author) });
  if (mine === undefined) return null;
  return mine ? m.common_comment_author_you() : m.common_comment_author_participant();
}

export function CommentThread({
  comments,
  max,
  label,
  add,
  onAdded,
}: Readonly<{
  comments: readonly ThreadComment[];
  max: number;
  /** Names the list and the form, such as "Comments on Systolic". */
  label: string;
  /** Left out when the phase closed the step, so the server would refuse the comment. */
  add?: ((body: string) => Promise<CommentOutcome>) | undefined;
  onAdded?: (() => Promise<void> | void) | undefined;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const form = useAppForm({
    defaultValues: { body: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: commentSchema(max) },
    onSubmit: async ({ value, formApi }) => {
      if (!add) return;
      let outcome: CommentOutcome;
      try {
        outcome = await add(value.body.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      formApi.reset();
      // The submit button was disabled while sending, which drops focus; the field takes it back.
      formRef.current?.querySelector<HTMLElement>('textarea[name="body"]')?.focus();
      await onAdded?.();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.common_comments_empty()}</p>
      ) : (
        <ol aria-label={label} className="flex flex-col gap-3">
          {comments.map((comment) => {
            const author = authorText(comment);
            return (
              <li key={comment.id} className="rounded-lg border p-3">
                <p className="whitespace-pre-wrap">{comment.body}</p>
                <p className="mt-1 type-meta text-muted-foreground">
                  {author && <span>{author}, </span>}
                  <DateTime value={comment.createdAt} />
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {add === undefined ? (
        <StepClosedNote />
      ) : (
        <form
          ref={formRef}
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppForm>
            <form.FormErrors />
          </form.AppForm>
          <form.AppField name="body">
            {(field) => (
              <field.TextareaField
                label={m.common_comment_label()}
                description={m.common_comment_description({ max })}
                rows={3}
              />
            )}
          </form.AppField>
          <div>
            <form.AppForm>
              <form.SubmitButton>{m.common_comment_submit()}</form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}
    </div>
  );
}
