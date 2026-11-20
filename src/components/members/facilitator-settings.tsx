// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's own choices on the members page: whether participants see who is in each
// stakeholder group (PR7), whether the brainstorm starts private (EL13), and the group the
// facilitator rates in (DE14).
import { revalidateLogic } from "@tanstack/react-form";
import { LogOutIcon, SaveIcon, UserPlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { expertTypeLabel } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { ExpertType } from "@/lib/project-roles";

/** Runs `call` and shows a refusal or a failure at the top of the form. */
async function submitCall<T>(
  formApi: Parameters<typeof applyServerRefusal>[0],
  call: () => Promise<Outcome<T>>,
): Promise<boolean> {
  try {
    const outcome = await call();
    if (outcome.ok) return true;
    applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
  } catch {
    applyServerRefusal(formApi, { form: m.common_error_unexpected() });
  }
  return false;
}

/** The PR7 setting: off by default, saved with its own button. */
export function GroupNamesForm({
  visible,
  save,
  onSaved,
}: Readonly<{
  visible: boolean;
  save: (visible: boolean) => Promise<Outcome<unknown>>;
  onSaved: (visible: boolean) => Promise<void> | void;
}>) {
  const id = useId();
  const form = useAppForm({
    defaultValues: { visible },
    onSubmit: async ({ value, formApi }) => {
      if (await submitCall(formApi, () => save(value.visible))) await onSaved(value.visible);
    },
  });
  return (
    <form
      noValidate
      aria-labelledby="group-names-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h3 id="group-names-title" className="text-lg font-semibold">
        {m.members_names_title()}
      </h3>
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.Field name="visible">
        {(field) => (
          <Field orientation="horizontal">
            <Checkbox
              id={id}
              checked={field.state.value}
              aria-describedby={`${id}-description`}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor={id}>{m.members_names_label()}</FieldLabel>
              <FieldDescription id={`${id}-description`}>{m.members_names_help()}</FieldDescription>
            </FieldContent>
          </Field>
        )}
      </form.Field>
      <div>
        <form.AppForm>
          <form.SubmitButton
            variant="outline"
            icon={<SaveIcon aria-hidden="true" data-icon="inline-start" />}
          >
            {m.members_names_save()}
          </form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}

/**
 * The private-first brainstorm (EL13): on by default, saved with its own button. After the reveal
 * the server refuses a change (`board_already_revealed`), so the form gives way to a note.
 */
export function PrivateBrainstormForm({
  enabled,
  revealed,
  save,
  onSaved,
}: Readonly<{
  enabled: boolean;
  revealed: boolean;
  save: (enabled: boolean) => Promise<Outcome<unknown>>;
  onSaved: (enabled: boolean) => Promise<void> | void;
}>) {
  const id = useId();
  const form = useAppForm({
    defaultValues: { enabled },
    onSubmit: async ({ value, formApi }) => {
      if (await submitCall(formApi, () => save(value.enabled))) await onSaved(value.enabled);
    },
  });
  return (
    <form
      noValidate
      aria-labelledby="private-brainstorm-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h3 id="private-brainstorm-title" className="text-lg font-semibold">
        {m.members_private_title()}
      </h3>
      {revealed ? (
        <p className="text-muted-foreground" data-testid="private-brainstorm-revealed">
          {m.members_private_revealed()}
        </p>
      ) : (
        <>
          <form.AppForm>
            <form.FormErrors />
          </form.AppForm>
          <form.Field name="enabled">
            {(field) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={id}
                  checked={field.state.value}
                  aria-describedby={`${id}-description`}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor={id}>{m.members_private_label()}</FieldLabel>
                  <FieldDescription id={`${id}-description`}>
                    {m.members_private_help()}
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          </form.Field>
          <div>
            <form.AppForm>
              <form.SubmitButton
                variant="outline"
                icon={<SaveIcon aria-hidden="true" data-icon="inline-start" />}
              >
                {m.members_private_save()}
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </>
      )}
    </form>
  );
}

function raterGroupSchema() {
  return z.object({
    groupId: z.string().min(1, { error: () => m.members_rater_group_required() }),
  });
}

/**
 * The facilitator joins one stakeholder group to rate, moves to another or leaves it (DE14).
 * The server refuses a move or a leave while a round is open (`rater_group_locked`).
 */
export function RaterGroupForm({
  groups,
  ownGroupId,
  roundOpen,
  save,
  onSaved,
}: Readonly<{
  groups: readonly { id: string; name: string; expertType: ExpertType }[];
  ownGroupId: string | null;
  /** True while a round is open, when only joining is possible. */
  roundOpen: boolean;
  save: (groupId: string | null) => Promise<Outcome<unknown>>;
  onSaved: (groupName: string | null) => Promise<void> | void;
}>) {
  const own = groups.find((group) => group.id === ownGroupId);
  const [leaving, setLeaving] = useState(false);
  const form = useAppForm({
    defaultValues: { groupId: ownGroupId ?? "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: raterGroupSchema() },
    onSubmit: async ({ value, formApi }) => {
      const group = groups.find((item) => item.id === value.groupId);
      if (await submitCall(formApi, () => save(value.groupId))) {
        await onSaved(group?.name ?? null);
      }
    },
  });

  async function leave() {
    setLeaving(true);
    try {
      if (await submitCall(form, () => save(null))) await onSaved(null);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <form
      noValidate
      aria-labelledby="rater-group-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-1">
        <h3 id="rater-group-title" className="text-lg font-semibold">
          {m.members_rater_title()}
        </h3>
        <p className="text-muted-foreground">{m.members_rater_description()}</p>
      </div>
      <p className="font-medium" data-testid="rater-group-status">
        {own ? m.members_rater_current({ group: own.name }) : m.members_rater_none()}
      </p>
      {own && roundOpen && (
        <p className="text-sm text-muted-foreground">{m.members_rater_locked()}</p>
      )}
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      {!(own && roundOpen) && (
        <>
          <form.AppField name="groupId">
            {(field) => (
              <field.SelectField
                label={m.members_rater_group_label()}
                placeholder={m.members_rater_group_placeholder()}
                options={groups.map((group) => ({
                  value: group.id,
                  label: m.members_group_option({
                    group: group.name,
                    expertType: expertTypeLabel(group.expertType),
                  }),
                }))}
              />
            )}
          </form.AppField>
          <div className="flex flex-wrap gap-2">
            <form.AppForm>
              <form.SubmitButton
                variant="outline"
                icon={<UserPlusIcon aria-hidden="true" data-icon="inline-start" />}
              >
                {own ? m.members_rater_move() : m.members_rater_join()}
              </form.SubmitButton>
            </form.AppForm>
            {own && (
              <Button
                type="button"
                variant="outline"
                disabled={leaving}
                aria-busy={leaving}
                onClick={() => void leave()}
              >
                <LogOutIcon aria-hidden="true" data-icon="inline-start" />
                {m.members_rater_leave()}
              </Button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
