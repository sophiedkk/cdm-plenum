// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The setup of a draft round (DE1, DE2, DE4, DE7, DE16): the elements to rate, the scale and
// the consensus rule, the closing date, whether the facilitator sees who rated what and, for
// round 1, the rule for adding proposed elements.
import { type AnyFieldApi, revalidateLogic, useStore } from "@tanstack/react-form";
import { type ReactNode, useId } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { FieldFeedback, useFieldA11y } from "@/components/form/field-a11y";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { m } from "@/i18n/messages";
import { type ConsensusRule, DEFAULT_RULE, type RuleError, ruleError } from "@/lib/consensus";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { ruleErrorMessage } from "@/lib/i18n/round-labels";
import { useTimeZone } from "@/lib/time-zone";
import { PROPOSAL_RULE_MAX } from "@/server/rounds/schemas";
import { formatNumber, fromLocalInput } from "./format";

/** An element the round can rate. */
export interface ElementChoice {
  id: string;
  name: string;
  description: string;
}

/** What the form sends: the server function's input without the project and round ids. */
export interface RoundSetup {
  /** Left out for a value round, which takes its lists from the Details page (DT3). */
  elementIds?: string[];
  rule: ConsensusRule;
  facilitatorSeesRaters: boolean;
  closesAt: string;
  /** Round 1 only (DE16): null when the facilitator left the rule empty. */
  proposalRule?: string | null;
}

/** What a create or update answers. */
export type RoundSetupOutcome =
  | { ok: true }
  | { ok: false; error: "rule_invalid"; rule: RuleError }
  | { ok: false; error: RefusalCode };

type RuleField = keyof ConsensusRule;

const RULE_FIELDS: readonly RuleField[] = [
  "scaleMin",
  "scaleMax",
  "bottomBandMax",
  "topBandMin",
  "agreementPct",
  "oppositionPct",
];

/** The field that shows each rule problem, so focus lands where the fix is. */
const RULE_ERROR_FIELD: Record<RuleError, RuleField> = {
  scale_not_integer: "scaleMax",
  scale_too_short: "scaleMax",
  bands_outside_scale: "topBandMin",
  bands_overlap: "topBandMin",
  agreement_not_above_half: "agreementPct",
  opposition_not_below_agreement: "oppositionPct",
};

/** The largest score and percentage the server takes (`ruleInput`). */
const SCORE_MAX = 100;

function parseNumber(text: string): number | null {
  const normalised = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  return Number(normalised);
}

type RuleValues = Record<RuleField, string>;

/** The rule the form holds, or null while a value is not a number. */
function ruleOfValues(values: RuleValues): ConsensusRule | null {
  const rule = {} as ConsensusRule;
  for (const key of RULE_FIELDS) {
    const value = parseNumber(values[key]);
    if (value === null) return null;
    rule[key] = value;
  }
  return rule;
}

/**
 * The checks of `createRoundInput` and `ruleError` with translated messages. Call it during
 * render, so the messages follow the active locale.
 */
export function roundSetupSchema(now: () => Date = () => new Date(), withElements = true) {
  const score = z.string().refine(
    (text) => {
      const value = parseNumber(text);
      return value !== null && Number.isInteger(value) && value <= SCORE_MAX;
    },
    { error: () => m.rounds_score_invalid({ max: SCORE_MAX }) },
  );
  const percentage = z.string().refine(
    (text) => {
      const value = parseNumber(text);
      return (
        value !== null && value <= 100 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9
      );
    },
    { error: () => m.rounds_percentage_invalid() },
  );
  return z
    .object({
      elementIds: withElements
        ? z.array(z.string()).min(1, { error: () => m.rounds_elements_required() })
        : z.array(z.string()),
      scaleMin: score,
      scaleMax: score,
      bottomBandMax: score,
      topBandMin: score,
      agreementPct: percentage,
      oppositionPct: percentage,
      closesAt: z.string().superRefine((text, ctx) => {
        const iso = fromLocalInput(text);
        if (iso === null) {
          ctx.addIssue({ code: "custom", message: m.rounds_closes_at_required() });
        } else if (new Date(iso) <= now()) {
          ctx.addIssue({ code: "custom", message: m.rounds_closes_at_future() });
        }
      }),
      facilitatorSeesRaters: z.boolean(),
      proposalRule: z.string().max(PROPOSAL_RULE_MAX, {
        error: () => m.rounds_proposal_rule_too_long({ max: PROPOSAL_RULE_MAX }),
      }),
    })
    .superRefine((values, ctx) => {
      const rule = ruleOfValues(values);
      if (rule === null) return;
      const problem = ruleError(rule);
      if (problem) {
        ctx.addIssue({
          code: "custom",
          path: [RULE_ERROR_FIELD[problem]],
          message: ruleErrorMessage(problem),
        });
      }
    });
}

/** The rule in plain words, as the round will apply it. */
export function ruleSentences(
  rule: ConsensusRule,
  kind: "elements" | "values" = "elements",
): string[] {
  const top = m.rounds_band_range({
    from: formatNumber(rule.topBandMin),
    to: formatNumber(rule.scaleMax),
  });
  const bottom = m.rounds_band_range({
    from: formatNumber(rule.scaleMin),
    to: formatNumber(rule.bottomBandMax),
  });
  const agreement = formatNumber(rule.agreementPct);
  const opposition = formatNumber(rule.oppositionPct);
  const words = { agreement, top, opposition, bottom };
  if (kind === "values") {
    return [
      m.rounds_value_rule_included(words),
      m.rounds_value_rule_excluded(words),
      m.rounds_value_rule_otherwise(),
    ];
  }
  return [m.rounds_rule_included(words), m.rounds_rule_excluded(words), m.rounds_rule_otherwise()];
}

function textOf(rule: ConsensusRule): RuleValues {
  const values = {} as RuleValues;
  for (const key of RULE_FIELDS) values[key] = String(rule[key]);
  return values;
}

/** A checkbox bound to a boolean form field, with its label and help text. */
function CheckboxControl({
  checked,
  onChange,
  label,
  description,
}: Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: ReactNode;
}>) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        aria-describedby={`${id}-description`}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
      </FieldContent>
    </Field>
  );
}

/**
 * The round setup form. `initial` holds the draft's values, or the defaults of a new round:
 * the DE1 rule and the elements the server would propose.
 */
export function RoundForm({
  elements,
  initial,
  submitLabel,
  save,
  onSaved,
  actions,
  kind = "elements",
}: Readonly<{
  /** A value round (DT3) has no elements to choose: `elements` is then null. */
  kind?: "elements" | "values";
  elements: readonly ElementChoice[] | null;
  initial: {
    elementIds: string[];
    rule: ConsensusRule;
    facilitatorSeesRaters: boolean;
    closesAt: string;
    /** The rule for adding proposed elements of round 1 (DE16); left out for a later round. */
    proposalRule?: string;
  };
  submitLabel: string;
  save: (setup: RoundSetup) => Promise<RoundSetupOutcome>;
  onSaved: () => Promise<void> | void;
  actions?: ReactNode;
}>) {
  const timeZone = useTimeZone();
  const takesProposals = initial.proposalRule !== undefined;
  const form = useAppForm({
    defaultValues: {
      elementIds: initial.elementIds,
      ...textOf(initial.rule),
      closesAt: initial.closesAt,
      facilitatorSeesRaters: initial.facilitatorSeesRaters,
      proposalRule: initial.proposalRule ?? "",
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: roundSetupSchema(undefined, elements !== null) },
    onSubmit: async ({ value, formApi }) => {
      const rule = ruleOfValues(value);
      const closesAt = fromLocalInput(value.closesAt);
      if (rule === null || closesAt === null) return;
      let outcome: RoundSetupOutcome;
      try {
        outcome = await save({
          ...(elements === null ? {} : { elementIds: value.elementIds }),
          rule,
          facilitatorSeesRaters: value.facilitatorSeesRaters,
          closesAt,
          ...(takesProposals
            ? { proposalRule: value.proposalRule.trim() === "" ? null : value.proposalRule.trim() }
            : {}),
        });
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        if (outcome.error === "rule_invalid" && "rule" in outcome) {
          applyServerRefusal(formApi, {
            fields: { [RULE_ERROR_FIELD[outcome.rule]]: ruleErrorMessage(outcome.rule) },
          });
        } else if (outcome.error === "closes_at_past") {
          applyServerRefusal(formApi, { fields: { closesAt: refusalMessage(outcome.error) } });
        } else {
          applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        }
        return;
      }
      await onSaved();
    },
  });
  const ruleValues = useStore(form.store, (state) => {
    const { scaleMin, scaleMax, bottomBandMax, topBandMin, agreementPct, oppositionPct } =
      state.values;
    return JSON.stringify({
      scaleMin,
      scaleMax,
      bottomBandMax,
      topBandMin,
      agreementPct,
      oppositionPct,
    });
  });
  const liveRule = ruleOfValues(JSON.parse(ruleValues) as RuleValues);
  const shownRule = liveRule !== null && ruleError(liveRule) === null ? liveRule : null;

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>

      {elements !== null && (
        <form.Field name="elementIds">
          {(field) => <ElementsField field={field} elements={elements} />}
        </form.Field>
      )}

      <FieldSet>
        <FieldLegend>{m.rounds_rule_legend()}</FieldLegend>
        <FieldDescription>
          {kind === "values" ? m.rounds_value_setup_question() : m.rounds_setup_question()}
        </FieldDescription>
        <FieldDescription>
          {kind === "values"
            ? m.rounds_value_rule_default_explained()
            : m.rounds_rule_default_explained()}
        </FieldDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="scaleMin">
            {(field) => (
              <field.TextField
                label={m.rounds_scale_min_label()}
                inputMode="numeric"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="scaleMax">
            {(field) => (
              <field.TextField
                label={m.rounds_scale_max_label()}
                inputMode="numeric"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="bottomBandMax">
            {(field) => (
              <field.TextField
                label={m.rounds_bottom_band_label()}
                description={m.rounds_bottom_band_help()}
                inputMode="numeric"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="topBandMin">
            {(field) => (
              <field.TextField
                label={m.rounds_top_band_label()}
                description={m.rounds_top_band_help()}
                inputMode="numeric"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="agreementPct">
            {(field) => (
              <field.TextField
                label={m.rounds_agreement_label()}
                description={m.rounds_agreement_help()}
                inputMode="decimal"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="oppositionPct">
            {(field) => (
              <field.TextField
                label={m.rounds_opposition_label()}
                description={m.rounds_opposition_help()}
                inputMode="decimal"
                autoComplete="off"
              />
            )}
          </form.AppField>
        </div>
        <div className="rounded-lg border p-4 text-sm">
          <p className="mb-2 font-medium">{m.rounds_rule_in_words()}</p>
          {shownRule ? (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {ruleSentences(shownRule, kind).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{m.rounds_rule_in_words_pending()}</p>
          )}
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              for (const [key, value] of Object.entries(textOf(DEFAULT_RULE))) {
                form.setFieldValue(key as RuleField, value);
              }
            }}
          >
            {m.rounds_rule_reset()}
          </Button>
        </div>
      </FieldSet>

      <form.Field name="closesAt">
        {(field) => (
          <ClosesAtField field={field} description={m.rounds_closes_at_help({ zone: timeZone })} />
        )}
      </form.Field>

      <form.Field name="facilitatorSeesRaters">
        {(field) => (
          <CheckboxControl
            checked={field.state.value}
            onChange={(checked) => field.handleChange(checked)}
            label={m.rounds_sees_raters_label()}
            description={m.rounds_sees_raters_help()}
          />
        )}
      </form.Field>

      {takesProposals && (
        <form.AppField name="proposalRule">
          {(field) => (
            <field.TextField
              label={m.rounds_proposal_rule_label()}
              description={m.rounds_proposal_rule_help({ max: PROPOSAL_RULE_MAX })}
              autoComplete="off"
            />
          )}
        </form.AppField>
      )}

      <p className="text-sm text-muted-foreground">{m.rounds_fixed_after_opening()}</p>

      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{submitLabel}</form.SubmitButton>
        </form.AppForm>
        {actions}
      </div>
    </form>
  );
}

function ClosesAtField({
  field,
  description,
}: Readonly<{ field: AnyFieldApi; description: string }>) {
  const a11y = useFieldA11y(field, description);
  return (
    <Field data-invalid={a11y.isInvalid} className="max-w-sm">
      <FieldLabel htmlFor={a11y.controlProps.id}>{m.rounds_closes_at_label()}</FieldLabel>
      <Input
        {...a11y.controlProps}
        type="datetime-local"
        value={field.state.value as string}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      <FieldFeedback a11y={a11y} description={description} />
    </Field>
  );
}

function ElementsField({
  field,
  elements,
}: Readonly<{ field: AnyFieldApi; elements: readonly ElementChoice[] }>) {
  const description = m.rounds_elements_help();
  const a11y = useFieldA11y(field, description);
  const selected = new Set(field.state.value as string[]);
  const base = useId();
  const set = (ids: string[]) => {
    field.handleChange(ids);
    field.handleBlur();
  };
  return (
    <FieldSet
      data-invalid={a11y.isInvalid}
      aria-describedby={a11y.controlProps["aria-describedby"]}
    >
      <FieldLegend>{m.rounds_elements_legend()}</FieldLegend>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {m.rounds_elements_count({ selected: selected.size, total: elements.length })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set(elements.map((e) => e.id))}
        >
          {m.rounds_elements_all()}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => set([])}>
          {m.rounds_elements_none()}
        </Button>
      </div>
      {elements.length === 0 ? (
        <p>{m.rounds_elements_board_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {elements.map((element, index) => {
            const id = `${base}-${index}`;
            return (
              <li key={element.id}>
                <Field orientation="horizontal">
                  <Checkbox
                    id={id}
                    // The first box takes the focus of an invalid list (WCAG 3.3.1).
                    aria-invalid={index === 0 ? a11y.isInvalid : undefined}
                    checked={selected.has(element.id)}
                    onCheckedChange={(checked) =>
                      set(
                        checked === true
                          ? [...selected, element.id]
                          : [...selected].filter((value) => value !== element.id),
                      )
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={id}>{element.name}</FieldLabel>
                    {element.description && (
                      <FieldDescription>{element.description}</FieldDescription>
                    )}
                  </FieldContent>
                </Field>
              </li>
            );
          })}
        </ul>
      )}
      <FieldFeedback a11y={a11y} description={description} />
    </FieldSet>
  );
}
