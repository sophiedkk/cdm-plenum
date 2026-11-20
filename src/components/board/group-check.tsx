// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The participants' check of the groups (EL24, ADR 0020): per element "Same as…" (the EL16 mark)
// and "Belongs elsewhere", per group "Something missing in this group?". Every remark is the
// reader's own; other participants never see it (EL2). Each disclosure opens below its button,
// so the buttons keep their place.
import { revalidateLogic } from "@tanstack/react-form";
import { useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { GROUP_MISSING_MAX } from "@/lib/element-groups";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { groupName } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { GroupCheck as Check, GroupedElement } from "@/server/elements/groups";
import type { SameAsPair } from "@/server/elements/marks";
import { SELECT_CLASS } from "./element-fields";

export interface GroupCheckActions {
  setElsewhere: (elementId: string, elsewhere: boolean) => Promise<Outcome<unknown>>;
  addSameAs: (elementId: string, sameAsId: string) => Promise<Outcome<unknown>>;
  addMissing: (groupId: string, body: string) => Promise<Outcome<unknown>>;
  onChanged: () => Promise<void> | void;
}

function missingSchema() {
  return z.object({
    body: z
      .string()
      .trim()
      .min(1, { error: () => m.board_check_missing_required() })
      .max(GROUP_MISSING_MAX, { error: () => m.board_text_too_long({ max: GROUP_MISSING_MAX }) }),
  });
}

async function run(call: () => Promise<Outcome<unknown>>, success?: string): Promise<boolean> {
  try {
    const outcome = await call();
    if (!outcome.ok) {
      toast.error(refusalMessage(outcome.error));
      return false;
    }
    if (success) toast.success(success);
    return true;
  } catch {
    toast.error(m.common_error_unexpected());
    return false;
  }
}

function SameAsForm({
  element,
  others,
  actions,
  onDone,
}: Readonly<{
  element: GroupedElement;
  others: readonly GroupedElement[];
  actions: GroupCheckActions;
  onDone: () => void;
}>) {
  const id = useId();
  const [choice, setChoice] = useState(others[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 pt-1"
      onSubmit={async (event) => {
        event.preventDefault();
        if (choice === "") return;
        setPending(true);
        const other = others.find((candidate) => candidate.id === choice);
        const saved = await run(
          () => actions.addSameAs(element.id, choice),
          m.board_same_as_added({ name: element.name, other: other?.name ?? "" }),
        );
        setPending(false);
        if (saved) {
          onDone();
          await actions.onChanged();
        }
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          {m.board_same_as_label()}
        </label>
        <select
          id={id}
          className={SELECT_CLASS}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
        {m.board_same_as_submit()}
      </Button>
    </form>
  );
}

function ElementRow({
  element,
  everyone,
  elsewhere,
  sameAs,
  actions,
}: Readonly<{
  element: GroupedElement;
  everyone: readonly GroupedElement[];
  elsewhere: boolean;
  sameAs: readonly GroupedElement[];
  actions: GroupCheckActions;
}>) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const formId = useId();
  const others = everyone.filter(
    (other) => other.id !== element.id && !sameAs.some((marked) => marked.id === other.id),
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5 last:border-b-0">
      <span className="min-w-0 break-words">
        {element.name}
        {sameAs.length > 0 && (
          <span className="block text-sm text-muted-foreground">
            {m.board_same_as_yours()} {sameAs.map((other) => other.name).join(", ")}
          </span>
        )}
      </span>
      <span className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-muted-foreground aria-expanded:text-foreground"
          aria-expanded={open}
          aria-controls={formId}
          aria-label={m.board_check_same_named({ name: element.name })}
          disabled={others.length === 0}
          onClick={() => setOpen((value) => !value)}
        >
          {m.board_check_same()}
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-muted-foreground aria-pressed:font-semibold aria-pressed:text-foreground"
          aria-pressed={elsewhere}
          aria-label={m.board_check_elsewhere_named({ name: element.name })}
          disabled={pending}
          onClick={async () => {
            setPending(true);
            if (await run(() => actions.setElsewhere(element.id, !elsewhere))) {
              await actions.onChanged();
            }
            setPending(false);
          }}
        >
          {m.board_check_elsewhere()}
        </Button>
      </span>
      <div id={formId} hidden={!open} className="w-full">
        {open && (
          <SameAsForm
            element={element}
            others={others}
            actions={actions}
            onDone={() => setOpen(false)}
          />
        )}
      </div>
    </li>
  );
}

function MissingForm({
  groupId,
  group,
  actions,
}: Readonly<{ groupId: string; group: string; actions: GroupCheckActions }>) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  const form = useAppForm({
    defaultValues: { body: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: missingSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: Outcome<unknown>;
      try {
        outcome = await actions.addMissing(groupId, value.body.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      formApi.reset();
      setOpen(false);
      toast.success(m.board_check_missing_saved());
      await actions.onChanged();
    },
  });
  return (
    <div className="px-4 py-2.5">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 text-muted-foreground"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => setOpen((value) => !value)}
      >
        {m.board_check_missing()}
      </Button>
      <div id={formId} hidden={!open}>
        {open && (
          <form
            noValidate
            className="mt-2 flex flex-col gap-3"
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
                  label={m.board_check_missing_label({ group })}
                  maxLength={GROUP_MISSING_MAX}
                  rows={2}
                />
              )}
            </form.AppField>
            <div>
              <form.AppForm>
                <form.SubmitButton variant="outline">
                  {m.board_check_missing_save()}
                </form.SubmitButton>
              </form.AppForm>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** The number of remarks the reader made: marks and "something missing" texts. */
export function remarkCount(check: Check, sameAs: readonly SameAsPair[]): number {
  const missing = Object.values(check.missing).reduce((sum, list) => sum + list.length, 0);
  return check.elsewhere.length + sameAs.length + missing;
}

export function GroupCheckList({
  check,
  sameAs,
  actions,
}: Readonly<{ check: Check; sameAs: readonly SameAsPair[]; actions: GroupCheckActions }>) {
  const everyone = [...check.groups.flatMap((group) => group.elements), ...check.ungrouped];
  const sections = [
    ...check.groups.map((group) => ({
      id: group.id,
      name: groupName(group),
      elements: group.elements,
      canMiss: true,
    })),
    ...(check.ungrouped.length > 0
      ? [
          {
            id: "ungrouped",
            name: m.board_check_ungrouped(),
            elements: check.ungrouped,
            canMiss: false,
          },
        ]
      : []),
  ];
  const sameAsOf = (id: string) =>
    everyone.filter((other) =>
      sameAs.some(
        (pair) =>
          (pair.elementId === id && pair.sameAsId === other.id) ||
          (pair.sameAsId === id && pair.elementId === other.id),
      ),
    );
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`check-${section.id}`}
          className="rounded-lg border"
        >
          <h3 id={`check-${section.id}`} className="border-b px-4 py-3 font-semibold">
            {section.name}
          </h3>
          <ul>
            {section.elements.map((element) => (
              <ElementRow
                key={element.id}
                element={element}
                everyone={everyone}
                elsewhere={check.elsewhere.includes(element.id)}
                sameAs={sameAsOf(element.id)}
                actions={actions}
              />
            ))}
          </ul>
          {section.canMiss && (check.missing[section.id] ?? []).length > 0 && (
            <div className="border-t px-4 py-2.5 text-sm">
              <h4 className="font-medium">{m.board_check_your_missing()}</h4>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {(check.missing[section.id] ?? []).map((body, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: remarks can repeat a text
                  <li key={index}>{body}</li>
                ))}
              </ul>
            </div>
          )}
          {section.canMiss && (
            <div className="border-t">
              <MissingForm groupId={section.id} group={section.name} actions={actions} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
