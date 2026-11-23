// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm board (EL23, ADR 0020): a strip with how many people added elements, then one
// column per brainstorm question (EL14). The member's own cards are marked, cards from existing
// models are dashed, and before the reveal other people's cards are a count only (EL13). Typing in
// a column and pressing Enter adds an element under that question. After the reveal similar names
// show while typing, with "Same as this" to support that element instead (EL15, EL16).
import { revalidateLogic, useStore } from "@tanstack/react-form";
import { CopyIcon } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { useAppForm } from "@/components/form/app-form";
import { FieldFeedback, useFieldA11y } from "@/components/form/field-a11y";
import { useFieldContext } from "@/components/form/form-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { m } from "@/i18n/messages";
import { type ElementPrompt, similarElements } from "@/lib/brainstorm";
import { ELEMENT_NAME_MAX } from "@/lib/elements";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { promptQuestion } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import { cn } from "@/lib/utils";
import type { BoardCard, BoardColumn, BrainstormBoard } from "@/server/elements/brainstorm-board";
import { addElementSchema, type HintElement } from "./add-element-schema";

/** The strip above the board: who has added, how many, and the reader's own count. */
export function BoardStrip({ board }: Readonly<{ board: BrainstormBoard }>) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted px-4 py-3 text-sm">
      {board.participants > 0 && (
        <span aria-hidden="true" className="inline-flex gap-0.5">
          {Array.from({ length: board.participants }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the dots are a count, not items
              key={index}
              className={cn(
                "size-2.5 rounded-full",
                index < board.contributors ? "bg-foreground" : "bg-border",
              )}
            />
          ))}
        </span>
      )}
      <span>
        {m.board_strip_people({ contributors: board.contributors, total: board.participants })}
      </span>
      <span>
        {board.privateStep
          ? m.board_column_hidden({
              count: board.columns.reduce((sum, column) => sum + column.hidden, 0),
            })
          : m.board_strip_added({ count: board.added })}
      </span>
      <span>{m.board_strip_own({ count: board.own })}</span>
    </div>
  );
}

function Card({ card, kind }: Readonly<{ card: BoardCard; kind: "own" | "model" | "other" }>) {
  return (
    <li
      className={cn(
        "rounded-md border px-2.5 py-2 text-sm leading-5 break-words",
        kind === "own" && "border-foreground/60 bg-muted",
        kind === "model" && "border-dashed text-muted-foreground",
        kind === "other" && "bg-background",
      )}
    >
      {card.name}
    </li>
  );
}

function Group({
  title,
  cards,
  kind,
}: Readonly<{
  title: string;
  cards: readonly BoardCard[];
  kind: "own" | "model" | "other";
}>) {
  const id = useId();
  if (cards.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h4
        id={id}
        className="px-0.5 pt-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h4>
      <ul aria-labelledby={id} className="flex flex-col gap-1.5">
        {cards.map((card) => (
          <Card key={card.id} card={card} kind={kind} />
        ))}
      </ul>
    </div>
  );
}

/** The one name field of a column, with the question as its hidden label. */
function ColumnNameField({ label }: Readonly<{ label: string }>) {
  const field = useFieldContext<string>();
  const a11y = useFieldA11y(field, null);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={a11y.controlProps.id} className="sr-only">
        {label}
      </label>
      <Input
        {...a11y.controlProps}
        value={field.state.value}
        maxLength={ELEMENT_NAME_MAX}
        autoComplete="off"
        placeholder={m.board_column_add_placeholder()}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      <FieldFeedback a11y={a11y} description={null} />
    </div>
  );
}

/** What the board does: add under a question, and mark a similar element as the same. */
export interface QuestionBoardActions {
  add: (prompt: ElementPrompt, name: string) => Promise<Outcome<unknown>>;
  onAdded: (name: string) => Promise<void> | void;
  /** Supports a hinted element; left out when marks are closed (EL16). */
  markSame?: ((element: HintElement) => Promise<Outcome<unknown>>) | undefined;
  onMarkedSame?: (element: HintElement) => Promise<void> | void;
}

function ColumnAddForm({
  prompt,
  hintSource,
  hintLink,
  actions,
}: Readonly<{
  prompt: ElementPrompt;
  /** Every card the reader may see, to compare names with; null before the reveal (EL13). */
  hintSource: readonly HintElement[] | null;
  hintLink: (element: HintElement) => ReactNode;
  actions: QuestionBoardActions;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const label = m.board_column_add_label({ question: promptQuestion(prompt) });
  const form = useAppForm({
    defaultValues: { name: "", description: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: addElementSchema() },
    onSubmit: async ({ value, formApi }) => {
      const name = value.name.trim();
      try {
        const outcome = await actions.add(prompt, name);
        if (!outcome.ok) {
          applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
          return;
        }
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      formApi.reset();
      await actions.onAdded(name);
      formRef.current?.querySelector("input")?.focus();
    },
  });
  const typed = useStore(form.store, (state) => state.values.name);
  const hints = hintSource === null ? [] : similarElements(typed, hintSource);

  async function sameAs(element: HintElement) {
    if (!actions.markSame) return;
    try {
      const outcome = await actions.markSame(element);
      if (!outcome.ok) {
        applyServerRefusal(form, { form: refusalMessage(outcome.error) });
        return;
      }
    } catch {
      applyServerRefusal(form, { form: m.common_error_unexpected() });
      return;
    }
    form.reset();
    await actions.onMarkedSame?.(element);
    formRef.current?.querySelector("input")?.focus();
  }

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={label}
      className="flex flex-col gap-2 border-t p-2"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="name">{() => <ColumnNameField label={label} />}</form.AppField>
      <div role="status" className="text-xs">
        {hints.length > 0 && (
          <>
            <p className="font-medium">{m.board_hints_title({ count: hints.length })}</p>
            <p className="text-muted-foreground">
              {actions.markSame ? m.board_hints_help_same() : m.board_hints_help()}
            </p>
          </>
        )}
      </div>
      {hints.length > 0 && (
        <ul aria-label={m.board_hints_list_label()} className="flex flex-col gap-1 text-sm">
          {hints.map((element) => (
            <li key={element.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {hintLink(element)}
              {actions.markSame && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void sameAs(element)}
                >
                  <CopyIcon aria-hidden="true" data-icon="inline-start" />
                  {m.board_hints_same()}
                  <span className="sr-only">: {element.name}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Column({
  column,
  canAdd,
  hintSource,
  hintLink,
  actions,
}: Readonly<{
  column: BoardColumn;
  canAdd: boolean;
  hintSource: readonly HintElement[] | null;
  hintLink: (element: HintElement) => ReactNode;
  actions: QuestionBoardActions;
}>) {
  const id = useId();
  const listed = column.own.length + column.fromModels.length + column.others.length;
  return (
    <section
      aria-labelledby={id}
      className="flex min-h-72 flex-col rounded-lg border bg-card lg:min-h-130"
    >
      <div className="border-b px-3 pt-3 pb-2">
        <h3 id={id} className="text-[0.9375rem] leading-[1.375rem] font-semibold">
          {promptQuestion(column.prompt)}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {m.board_column_listed({ count: listed })}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <Group title={m.board_column_yours()} cards={column.own} kind="own" />
        <Group title={m.board_column_from_models()} cards={column.fromModels} kind="model" />
        <Group title={m.board_column_from_others()} cards={column.others} kind="other" />
        {column.hidden > 0 && (
          <p className="mt-1 rounded-md bg-muted p-2 text-center text-xs text-muted-foreground">
            {m.board_column_hidden({ count: column.hidden })}
          </p>
        )}
      </div>
      {canAdd && (
        <ColumnAddForm
          prompt={column.prompt}
          hintSource={hintSource}
          hintLink={hintLink}
          actions={actions}
        />
      )}
    </section>
  );
}

export function QuestionBoard({
  board,
  canAdd,
  hintLink,
  actions,
}: Readonly<{
  board: BrainstormBoard;
  canAdd: boolean;
  hintLink: (element: HintElement) => ReactNode;
  actions: QuestionBoardActions;
}>) {
  const hintSource = board.hints;
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {board.columns.map((column) => (
        <Column
          key={column.prompt}
          column={column}
          canAdd={canAdd}
          hintSource={hintSource}
          hintLink={hintLink}
          actions={actions}
        />
      ))}
    </div>
  );
}
