// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The comments under the scope (SC2) and under an element (EL6): the list, oldest first, and a
// form to add one. The author shows only when the list carries one, which only the facilitator's
// queries do (EL2, ADR 0005).
import { revalidateLogic } from "@tanstack/react-form";
import { useRef } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { m } from "@/i18n/messages";
import { getLocale } from "@/i18n/runtime";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";

export interface ThreadComment {
  id: string;
  body: string;
  createdAt: string;
  /** Set in the facilitator's list only; null there when the author left the project. */
  author?: { name: string; email: string } | null;
}

export type CommentOutcome = { ok: true } | { ok: false; error: RefusalCode };

// NOTE: no requirement sets the time zone; our own design. A fixed zone renders the same text on
// the server and in the browser, and the first users work in the Netherlands.
const TIME_ZONE = "Europe/Amsterdam";

/** A date and time in the active locale, such as "19 Nov 2026, 14:05". */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

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

function authorText(author: ThreadComment["author"]): string | null {
  if (author === undefined) return null;
  if (author === null) return m.common_comment_author_left();
  return m.common_comment_author({ name: author.name.trim() || author.email });
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
  add: (body: string) => Promise<CommentOutcome>;
  onAdded: () => Promise<void> | void;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const form = useAppForm({
    defaultValues: { body: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: commentSchema(max) },
    onSubmit: async ({ value, formApi }) => {
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
      await onAdded();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.common_comments_empty()}</p>
      ) : (
        <ol aria-label={label} className="flex flex-col gap-3">
          {comments.map((comment) => {
            const author = authorText(comment.author);
            return (
              <li key={comment.id} className="rounded-lg border p-3">
                <p className="whitespace-pre-wrap">{comment.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {author && <span>{author}, </span>}
                  <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                </p>
              </li>
            );
          })}
        </ol>
      )}
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
    </div>
  );
}
