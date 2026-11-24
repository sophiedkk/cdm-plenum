// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The first look (EL22, ADR 0020): one element from existing models at a time, the models it is
// found in, three answers and Previous and Next, with the list beside it. The answer saves at
// once; the buttons keep their place, so nothing moves under the pointer.
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { FIRST_LOOK_ANSWERS, type FirstLookAnswer } from "@/lib/first-look";
import type { Outcome } from "@/lib/forms/outcome";
import { refusalMessage } from "@/lib/i18n/refusals";
import { cn } from "@/lib/utils";
import type { FirstLook } from "@/server/elements/first-look";
import { ReferenceText } from "./reference-text";

const ANSWER_LABELS: Record<FirstLookAnswer, () => string> = {
  belongs: () => m.board_first_look_belongs(),
  not_sure: () => m.board_first_look_not_sure(),
  not_belongs: () => m.board_first_look_not_belongs(),
};

const ANSWER_SHORT: Record<FirstLookAnswer, () => string> = {
  belongs: () => m.board_first_look_short_belongs(),
  not_sure: () => m.board_first_look_short_not_sure(),
  not_belongs: () => m.board_first_look_short_not_belongs(),
};

export function FirstLookCard({
  projectId,
  look,
  answer,
  canAnswer,
}: Readonly<{
  projectId: string;
  look: FirstLook;
  answer: (elementId: string, value: FirstLookAnswer) => Promise<Outcome<unknown>>;
  /** False when the phase closed the first look; the answers stay readable. */
  canAnswer: boolean;
}>) {
  const firstOpen = look.elements.findIndex((element) => element.answer === null);
  const [position, setPosition] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [answers, setAnswers] = useState<Record<string, FirstLookAnswer | null>>(() =>
    Object.fromEntries(look.elements.map((element) => [element.id, element.answer])),
  );
  const [pending, setPending] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const element = look.elements[position];
  if (!element) return null;
  const last = position === look.elements.length - 1;
  const current = answers[element.id] ?? null;

  function go(to: number) {
    setPosition(to);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function choose(value: FirstLookAnswer) {
    if (!element) return;
    const before = answers[element.id] ?? null;
    setAnswers((all) => ({ ...all, [element.id]: value }));
    setPending(true);
    try {
      const outcome = await answer(element.id, value);
      if (!outcome.ok) {
        setAnswers((all) => ({ ...all, [element.id]: before }));
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      setAnswers((all) => ({ ...all, [element.id]: before }));
      toast.error(m.common_error_unexpected());
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17.5rem]">
      <section
        aria-labelledby="first-look-element"
        className="flex min-h-90 flex-col rounded-lg border bg-card p-5 shadow-xs sm:p-8"
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {m.board_first_look_position({ position: position + 1, total: look.elements.length })}
        </p>
        <h3
          id="first-look-element"
          ref={heading}
          tabIndex={-1}
          className="mt-1 text-2xl font-semibold tracking-tight break-words outline-none sm:text-3xl"
        >
          {element.name}
        </h3>
        {element.reference && <ReferenceText reference={element.reference} className="mt-1" />}
        {element.description !== "" && (
          <p className="mt-1 text-muted-foreground">{element.description}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">{m.board_first_look_found_in()}</span>
          <ul className="contents">
            {element.foundIn.map((model) => (
              <li
                key={`${model.kind}:${model.title}`}
                className="rounded-full border px-2.5 text-sm leading-6"
              >
                {model.title}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto pt-8">
          <fieldset className="min-w-0">
            <legend className="text-lg font-semibold">
              {m.board_first_look_question({ concept: look.concept })}
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {FIRST_LOOK_ANSWERS.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={current === value ? "default" : "outline"}
                  aria-pressed={current === value}
                  disabled={!canAnswer || pending}
                  onClick={() => void choose(value)}
                >
                  {ANSWER_LABELS[value]()}
                </Button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="mt-6 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={position === 0}
            onClick={() => go(position - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
            {m.board_first_look_previous()}
          </Button>
          {last ? (
            <Button asChild>
              <Link to="/projects/$projectId/brainstorm" params={{ projectId }}>
                {m.board_first_look_then_add()}
              </Link>
            </Button>
          ) : (
            <Button type="button" onClick={() => go(position + 1)}>
              {m.board_first_look_next()}
              <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          )}
        </div>
      </section>
      <aside aria-labelledby="first-look-list" className="rounded-lg border p-4">
        <h3 id="first-look-list" className="font-semibold">
          {m.board_first_look_list()}
        </h3>
        <ol className="mt-2 flex flex-col gap-0.5">
          {look.elements.map((item, index) => {
            const given = answers[item.id] ?? null;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={index === position ? "step" : undefined}
                  onClick={() => go(index)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted",
                    index === position && "bg-muted font-semibold",
                  )}
                >
                  <span className="min-w-0 break-words">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {given === null ? "" : ANSWER_SHORT[given]()}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <Link
          to="/projects/$projectId/brainstorm"
          params={{ projectId }}
          className="mt-3 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {m.board_first_look_then()}
        </Link>
      </aside>
    </div>
  );
}
