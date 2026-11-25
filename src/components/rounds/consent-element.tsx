// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One card of a Team round (DE20, DE18, ADR 0023): the element's name and description, the
// question, the four answers as a radio group of large buttons, and the reason at full width.
// Leave out and Discuss need a reason, and the error stands at the field. A choice that needs no
// reason saves at once; one that does saves when the reason is there. The answers of the
// previous round show by name below the question, in a panel that opens under its button.
import { ChevronRightIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { type Ref, useId, useRef, useState } from "react";
import { ReferenceText } from "@/components/board/reference-text";
import { useModelType } from "@/components/projects/model-type-context";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { m } from "@/i18n/messages";
import {
  CONSENT_ANSWERS,
  CONSENT_TEXT_MAX,
  type ConsentAnswer,
  consentNeedsReason,
  isConsentAnswer,
} from "@/lib/consent";
import { groupName } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import { consentLabel } from "@/lib/i18n/round-labels";
import type { MyElement } from "@/server/rounds/ratings";
import { Chosen, OPTION } from "./rating-element";

/** What a save or a clear answers. */
export type ConsentOutcome = { ok: true } | { ok: false; error: string };

type SaveState = "idle" | "saving" | "cleared" | { saved: string } | { error: string };

/** The previous round's answers by name, in a panel that opens below its button. */
function PreviousAnswers({
  base,
  previous,
}: Readonly<{ base: string; previous: NonNullable<MyElement["previousConsent"]> }>) {
  const [open, setOpen] = useState(false);
  const panelId = `${base}-previous`;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Button
        type="button"
        variant="link"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="h-auto self-start px-0 text-muted-foreground"
      >
        <ChevronRightIcon
          aria-hidden="true"
          data-icon="inline-start"
          className={
            open ? "rotate-90 motion-safe:transition-transform" : "motion-safe:transition-transform"
          }
        />
        {m.rounds_consent_previous_heading({ number: previous.number })}
      </Button>
      <div id={panelId} hidden={!open} className="rounded-md border p-3">
        {previous.answers.length === 0 ? (
          <p className="text-muted-foreground">{m.rounds_consent_previous_none()}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {previous.answers.map((row) => (
              <li key={row.name} className="break-words">
                <span className="font-semibold">{row.name}</span>: {consentLabel(row.answer)}
                {row.reason && <span className="text-muted-foreground"> ({row.reason})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One element of a Team round as a card: a region named by the element's heading. */
export function ConsentElement({
  element,
  position,
  headingRef,
  editable,
  save,
  clear,
}: Readonly<{
  element: MyElement;
  /** The card's place among the round's elements, from 1. */
  position: { index: number; total: number };
  /** The heading, which takes focus when the member moves to this card. */
  headingRef?: Ref<HTMLHeadingElement>;
  editable: boolean;
  save: (answer: ConsentAnswer, reason: string) => Promise<ConsentOutcome>;
  clear: () => Promise<ConsentOutcome>;
}>) {
  const modelType = useModelType();
  const base = useId();
  const initial = element.own.answer ?? "";
  const [choice, setChoice] = useState<ConsentAnswer | "">(initial);
  const [reason, setReason] = useState(element.own.reason ?? "");
  const savedReason = useRef(element.own.reason ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [reasonFocused, setReasonFocused] = useState(false);
  // The error of the reason field: set when the answer needs one and it is empty, or when the
  // server says so.
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Arrow keys in the radio group change the choice on every press; the saves run one after the
  // other, so the last choice is the one the server keeps.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const run = (action: () => Promise<ConsentOutcome>, done: SaveState): Promise<boolean> => {
    setState("saving");
    const next = queue.current.then(async () => {
      try {
        const outcome = await action();
        if (outcome.ok) {
          setState(done);
          setReasonError(null);
        } else if (outcome.error === "consent_reason_required") {
          setState("idle");
          setReasonError(refusalMessage("consent_reason_required"));
        } else {
          setState({ error: refusalMessage(outcome.error) });
        }
        return outcome.ok;
      } catch {
        setState({ error: m.common_error_unexpected() });
        return false;
      }
    });
    queue.current = next;
    return next;
  };

  /** Saves the answer, or asks for the reason it still needs. */
  const submit = async (value: ConsentAnswer, text: string) => {
    if (consentNeedsReason(value) && text.trim() === "") {
      setReasonError(refusalMessage("consent_reason_required"));
      setState("idle");
      return;
    }
    const ok = await run(() => save(value, value === "abstain" ? "" : text), {
      saved: m.rounds_consent_saved({ answer: consentLabel(value) }),
    });
    if (ok) savedReason.current = value === "abstain" ? "" : text;
  };
  const choose = (value: string) => {
    if (!isConsentAnswer(value)) return;
    setChoice(value);
    if (value === "abstain") setReason("");
    void submit(value, value === "abstain" ? "" : reason);
  };

  const statusText =
    reasonError !== null && choice !== "" && state === "idle"
      ? m.rounds_consent_reason_pending()
      : state === "idle"
        ? ""
        : state === "saving"
          ? m.rounds_rate_saving()
          : state === "cleared"
            ? m.rounds_rate_cleared()
            : "saved" in state
              ? state.saved
              : state.error;
  const needsReason = choice !== "" && consentNeedsReason(choice);
  const errorId = `${base}-reason-error`;
  const describedBy =
    reasonError !== null ? errorId : reasonFocused ? `${base}-reason-help` : undefined;

  return (
    <section
      aria-labelledby={`${base}-heading`}
      className="flex flex-col gap-4 rounded-lg border bg-card px-4 py-4 text-card-foreground shadow-xs sm:px-6"
    >
      <div className="flex flex-col gap-1">
        {element.group && (
          <p className="text-sm text-muted-foreground">
            <span className="sr-only">{m.rounds_card_group()} </span>
            {groupName(element.group, modelType)}
          </p>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3
            id={`${base}-heading`}
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 type-page-title break-words outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {element.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {m.rounds_card_position({ index: position.index, total: position.total })}
          </p>
        </div>
        {element.reference && <ReferenceText reference={element.reference} />}
        {element.description && (
          <p className="break-words text-muted-foreground">{element.description}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p id={`${base}-question`} className="font-semibold">
          {m.rounds_consent_question()}
        </p>
        {element.previousConsent && (
          <PreviousAnswers base={base} previous={element.previousConsent} />
        )}
        <RadioGroupPrimitive.Root
          aria-labelledby={`${base}-question`}
          value={choice}
          disabled={!editable}
          onValueChange={choose}
          className="flex max-w-full flex-wrap items-start gap-3"
        >
          {CONSENT_ANSWERS.map((answer) => (
            <RadioGroupPrimitive.Item
              key={answer}
              value={answer}
              className={`${OPTION} min-w-24 pr-6 pl-3 text-base`}
            >
              {consentLabel(answer)}
              <Chosen />
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
          <p
            role="status"
            className={
              typeof state === "object" && "error" in state
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {statusText}
          </p>
          {editable && choice !== "" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                if (await run(clear, "cleared")) {
                  setChoice("");
                  savedReason.current = "";
                  setReason("");
                }
              }}
            >
              {m.rounds_rate_clear()}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${base}-reason`}>
          {needsReason ? m.rounds_consent_reason_required() : m.rounds_consent_reason_optional()}
        </FieldLabel>
        <Textarea
          id={`${base}-reason`}
          value={reason}
          rows={2}
          maxLength={CONSENT_TEXT_MAX}
          disabled={!editable || choice === "abstain"}
          aria-required={needsReason}
          aria-invalid={reasonError !== null}
          aria-describedby={describedBy}
          onChange={(event) => {
            setReason(event.target.value);
            if (event.target.value.trim() !== "") setReasonError(null);
          }}
          onFocus={() => setReasonFocused(true)}
          onBlur={() => {
            setReasonFocused(false);
            if (choice !== "" && reason !== savedReason.current) void submit(choice, reason);
            else if (needsReason && reason.trim() === "") {
              setReasonError(refusalMessage("consent_reason_required"));
            }
          }}
        />
        {reasonError !== null && (
          <p id={errorId} className="text-sm text-destructive">
            {reasonError}
          </p>
        )}
        {/* Help on demand: the note shows while the field has focus. */}
        {reasonFocused && reasonError === null && (
          <FieldDescription id={`${base}-reason-help`}>
            {m.rounds_consent_reason_help()}
          </FieldDescription>
        )}
      </div>
    </section>
  );
}
