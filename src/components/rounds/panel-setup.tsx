// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The panel of a project next to its minimum (DE11), the change class and the project's own
// minimum per expert type (DE13). Both are fixed once a round has opened (`panel_locked`).
import { revalidateLogic } from "@tanstack/react-form";
import { CircleAlertIcon, CircleCheckIcon, LockIcon } from "lucide-react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { StatusBadge } from "@/components/status/status-badge";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { changeClassDescription, changeClassLabel, expertTypeLabel } from "@/lib/i18n/round-labels";
import { CHANGE_CLASSES, type ChangeClass, EXPERT_TYPES, type ExpertType } from "@/lib/panel";
import type { PanelStatus } from "@/server/rounds/queries";

/** What a panel action answers: done, or refused with a code. */
export type PanelOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The joined participants per expert type next to the minimum, with any shortfall in words. */
export function PanelTable({
  joined,
  minimum,
  caption,
}: Readonly<{
  joined: Record<ExpertType, number>;
  minimum: Record<ExpertType, number>;
  caption: string;
}>) {
  return (
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.rounds_panel_column_type()}</TableHead>
          <TableHead scope="col">{m.rounds_panel_column_joined()}</TableHead>
          <TableHead scope="col">{m.rounds_panel_column_minimum()}</TableHead>
          <TableHead scope="col">{m.rounds_panel_column_status()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {EXPERT_TYPES.map((type) => {
          const short = minimum[type] - joined[type];
          return (
            <TableRow key={type}>
              <TableHead scope="row" className="font-normal">
                {expertTypeLabel(type)}
              </TableHead>
              <TableCell>{joined[type]}</TableCell>
              <TableCell>{minimum[type]}</TableCell>
              <TableCell>
                {short > 0 ? (
                  <StatusBadge
                    tone="warning"
                    icon={CircleAlertIcon}
                    label={m.rounds_panel_short({ count: short })}
                  />
                ) : (
                  <StatusBadge
                    tone="success"
                    icon={CircleCheckIcon}
                    label={m.rounds_panel_complete()}
                  />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** A sentence per expert type below the minimum, or one sentence that the panel is complete. */
export function shortfallText(shortfall: PanelStatus["shortfall"]): string[] {
  if (shortfall.length === 0) return [m.rounds_panel_meets_minimum()];
  return shortfall.map((item) =>
    m.rounds_panel_shortfall_line({
      type: expertTypeLabel(item.expertType),
      joined: item.joined,
      minimum: item.minimum,
    }),
  );
}

function ChangeClassForm({
  current,
  save,
}: Readonly<{
  current: ChangeClass;
  save: (changeClass: ChangeClass) => Promise<PanelOutcome>;
}>) {
  const form = useAppForm({
    defaultValues: { changeClass: current },
    onSubmit: async ({ value, formApi }) => {
      let outcome: PanelOutcome;
      try {
        outcome = await save(value.changeClass);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
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
      <form.Field name="changeClass">
        {(field) => (
          <FieldSet>
            <FieldLegend>{m.rounds_change_class_legend()}</FieldLegend>
            <FieldDescription>{m.rounds_change_class_help()}</FieldDescription>
            <RadioGroup
              name={field.name}
              value={field.state.value}
              onValueChange={(value) => field.handleChange(value as ChangeClass)}
            >
              {CHANGE_CLASSES.map((changeClass) => {
                const id = `change-class-${changeClass}`;
                return (
                  <Field key={changeClass} orientation="horizontal">
                    <RadioGroupItem
                      value={changeClass}
                      id={id}
                      aria-describedby={`${id}-description`}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={id}>{changeClassLabel(changeClass)}</FieldLabel>
                      <FieldDescription id={`${id}-description`}>
                        {changeClassDescription(changeClass)}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                );
              })}
            </RadioGroup>
          </FieldSet>
        )}
      </form.Field>
      <div>
        <form.AppForm>
          <form.SubmitButton variant="outline">{m.rounds_change_class_save()}</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}

/** The largest minimum the server takes (`panelMinimumInput`). */
const MINIMUM_MAX = 1000;

function minimumSchema() {
  const count = z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) <= MINIMUM_MAX), {
      error: () => m.rounds_minimum_invalid({ max: MINIMUM_MAX }),
    });
  return z.object({ clinical: count, terminology: count, architecture: count });
}

function MinimumForm({
  status,
  save,
}: Readonly<{
  status: PanelStatus;
  save: (expertType: ExpertType, minimum: number | null) => Promise<PanelOutcome>;
}>) {
  const initial = (type: ExpertType) => {
    const value = status.overrides[type];
    return value === undefined ? "" : String(value);
  };
  const form = useAppForm({
    defaultValues: {
      clinical: initial("clinical"),
      terminology: initial("terminology"),
      architecture: initial("architecture"),
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: minimumSchema() },
    onSubmit: async ({ value, formApi }) => {
      for (const type of EXPERT_TYPES) {
        const text = value[type].trim();
        if (text === initial(type)) continue;
        let outcome: PanelOutcome;
        try {
          outcome = await save(type, text === "" ? null : Number(text));
        } catch {
          applyServerRefusal(formApi, { form: m.common_error_unexpected() });
          return;
        }
        if (!outcome.ok) {
          applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
          return;
        }
      }
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
      <FieldSet>
        <FieldLegend>{m.rounds_minimum_legend()}</FieldLegend>
        <FieldDescription>{m.rounds_minimum_help()}</FieldDescription>
        <div className="grid gap-4 sm:grid-cols-3">
          {EXPERT_TYPES.map((type) => (
            <form.AppField key={type} name={type}>
              {(field) => (
                <field.TextField
                  label={expertTypeLabel(type)}
                  description={m.rounds_minimum_class_default({
                    count: status.classDefault[type],
                  })}
                  inputMode="numeric"
                  autoComplete="off"
                />
              )}
            </form.AppField>
          ))}
        </div>
      </FieldSet>
      <div>
        <form.AppForm>
          <form.SubmitButton variant="outline">{m.rounds_minimum_save()}</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}

/**
 * The panel section of the rounds page for the facilitator: the table, and while no round has
 * opened the change class and the minimum per expert type.
 */
export function PanelSetup({
  status,
  saveChangeClass,
  saveMinimum,
}: Readonly<{
  status: PanelStatus;
  saveChangeClass: (changeClass: ChangeClass) => Promise<PanelOutcome>;
  saveMinimum: (expertType: ExpertType, minimum: number | null) => Promise<PanelOutcome>;
}>) {
  return (
    <section aria-labelledby="panel-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="panel-heading" className="text-lg font-semibold">
          {m.rounds_panel_heading()}
        </h3>
        <p className="text-muted-foreground">
          {m.rounds_panel_intro({ changeClass: changeClassLabel(status.changeClass) })}
        </p>
      </div>
      <PanelTable
        joined={status.joined}
        minimum={status.minimum}
        caption={m.rounds_panel_caption()}
      />
      <ul className="flex flex-col gap-1 text-sm">
        {shortfallText(status.shortfall).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {status.locked ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LockIcon aria-hidden="true" className="size-4" />
          {m.rounds_panel_locked()}
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <ChangeClassForm
            key={status.changeClass}
            current={status.changeClass}
            save={saveChangeClass}
          />
          <MinimumForm key={JSON.stringify(status.overrides)} status={status} save={saveMinimum} />
        </div>
      )}
    </section>
  );
}
