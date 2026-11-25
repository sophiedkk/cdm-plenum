// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The results of a closed Team round (DE20, ADR 0023): one line per element with its outcome and
// the answers counted, "Answers" opening each answer and reason by name, and for the facilitator
// a "Settle" button on every element that is still "To discuss". The decision opens in a dialog
// with a required note; a settled element shows its note.
import { revalidateLogic } from "@tanstack/react-form";
import { ChevronRightIcon, GavelIcon } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { FormDialog } from "@/components/members/form-dialog";
import { useModelType } from "@/components/projects/model-type-context";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { CONSENT_TEXT_MAX } from "@/lib/consent";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { consentLabel } from "@/lib/i18n/round-labels";
import type { ElementRoundResult } from "@/server/rounds/results";
import { headingBefore } from "./group-rows";
import { OutcomeBadge } from "./round-badges";

/** What a settle answers. */
export type SettleOutcome = { ok: true } | { ok: false; error: RefusalCode };

type Settle = (
  elementId: string,
  outcome: "included" | "excluded",
  note: string,
) => Promise<SettleOutcome>;

function settleSchema() {
  return z.object({
    outcome: z.string().refine((value) => value === "included" || value === "excluded", {
      error: () => m.rounds_consent_settle_outcome_required(),
    }),
    note: z
      .string()
      .trim()
      .min(1, { error: () => m.common_refusal_settle_note_required() })
      .max(CONSENT_TEXT_MAX),
  });
}

function SettleForm({
  elementId,
  settle,
  onDone,
  cancel,
}: Readonly<{
  elementId: string;
  settle: Settle;
  onDone: () => void;
  cancel: ReactNode;
}>) {
  const form = useAppForm({
    defaultValues: { outcome: "", note: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: settleSchema() },
    onSubmit: async ({ value, formApi }) => {
      if (value.outcome !== "included" && value.outcome !== "excluded") return;
      let result: SettleOutcome;
      try {
        result = await settle(elementId, value.outcome, value.note.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!result.ok) {
        if (result.error === "settle_note_required") {
          applyServerRefusal(formApi, { fields: { note: refusalMessage(result.error) } });
        } else {
          applyServerRefusal(formApi, { form: refusalMessage(result.error) });
        }
        return;
      }
      onDone();
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="outcome">
        {(field) => (
          <field.SelectField
            label={m.rounds_consent_settle_outcome_label()}
            placeholder={m.rounds_consent_settle_outcome_placeholder()}
            options={[
              { value: "included", label: m.rounds_consent_outcome_included() },
              { value: "excluded", label: m.rounds_consent_outcome_excluded() },
            ]}
          />
        )}
      </form.AppField>
      <form.AppField name="note">
        {(field) => (
          <field.TextareaField
            label={m.rounds_consent_settle_note_label()}
            rows={3}
            maxLength={CONSENT_TEXT_MAX}
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap justify-end gap-2">
        {cancel}
        <form.AppForm>
          <form.SubmitButton>{m.rounds_consent_settle_submit()}</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}

function ConsentLine({
  element,
  settle,
  afterSettle,
}: Readonly<{
  element: ElementRoundResult & { consent: NonNullable<ElementRoundResult["consent"]> };
  settle: Settle | null;
  afterSettle: (name: string) => void;
}>) {
  const { consent } = element;
  const toDiscuss = element.outcome === "no_consensus" && consent.settled === null;
  return (
    <li className="flex flex-col gap-2 border-b py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 font-semibold break-words">{element.name}</span>
        <OutcomeBadge outcome={element.outcome} consent />
        <span className="text-sm text-muted-foreground">
          {m.rounds_consent_counts({
            include: consent.counts.include,
            leave_out: consent.counts.leave_out,
            discuss: consent.counts.discuss,
            abstain: consent.counts.abstain,
          })}
        </span>
        {settle !== null && toDiscuss && (
          <span className="sm:ml-auto">
            <FormDialog
              title={m.rounds_consent_settle_title({ name: element.name })}
              description={m.rounds_consent_settle_description()}
              trigger={
                <Button type="button" variant="outline" size="sm">
                  <GavelIcon aria-hidden="true" data-icon="inline-start" />
                  {m.rounds_consent_settle()}
                  <span className="sr-only">: {element.name}</span>
                </Button>
              }
            >
              {({ close, cancel }) => (
                <SettleForm
                  elementId={element.id}
                  settle={settle}
                  cancel={cancel}
                  onDone={() => {
                    close();
                    afterSettle(element.name);
                  }}
                />
              )}
            </FormDialog>
          </span>
        )}
      </div>
      {consent.settled && (
        <p className="text-sm break-words">
          {m.rounds_consent_settled_note({ note: consent.settled.note })}
        </p>
      )}
      <details className="text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 transition-transform [details[open]>summary>&]:rotate-90"
          />
          {m.rounds_consent_answers_toggle()}
          <span className="sr-only">: {element.name}</span>
        </summary>
        {consent.answers.length === 0 ? (
          <p className="mt-2 text-muted-foreground">{m.rounds_consent_answers_none()}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {consent.answers.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list without state; two members without a name share their text.
              <li key={index} className="break-words">
                <span className="font-semibold">{row.name || m.common_author_unnamed()}</span>:{" "}
                {consentLabel(row.answer)}
                {row.reason && <span className="text-muted-foreground"> ({row.reason})</span>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

/**
 * The results of a closed Team round under the group headings in the server's order (DE19).
 * `settle` is the facilitator's action; without it the list is read-only.
 */
export function ConsentResults({
  elements,
  settle,
  afterSettle,
}: Readonly<{
  elements: readonly ElementRoundResult[];
  settle: Settle | null;
  afterSettle: (name: string) => void;
}>) {
  const modelType = useModelType();
  const sections: { heading: string | null; items: (typeof elements)[number][] }[] = [];
  elements.forEach((element, index) => {
    const heading = headingBefore(elements, index, modelType);
    const last = sections.at(-1);
    if (heading !== null || last === undefined) {
      sections.push({ heading, items: [element] });
    } else {
      last.items.push(element);
    }
  });
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <section key={section.items[0]?.id} className="flex flex-col">
          {section.heading !== null && (
            <h4 className="bg-muted/30 px-3 py-1.5 font-semibold">{section.heading}</h4>
          )}
          <ul className="border-t">
            {section.items.map((element) =>
              element.consent ? (
                <ConsentLine
                  key={element.id}
                  element={{ ...element, consent: element.consent }}
                  settle={settle}
                  afterSettle={afterSettle}
                />
              ) : null,
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
