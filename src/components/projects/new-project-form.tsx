// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { revalidateLogic } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { PROJECT_MODES, type ProjectMode } from "@/lib/project-mode";
import { PROJECT_NAME_MAX } from "@/lib/project-roles";
import { ModeChoice } from "./mode-choice";

/**
 * The limits of `createProjectInput` (src/server/projects/schemas.ts) with translated messages.
 * Call it during render, so the messages follow the active locale.
 */
export function newProjectSchema() {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => m.projects_name_required() })
      .max(PROJECT_NAME_MAX, {
        error: () => m.projects_name_too_long({ max: PROJECT_NAME_MAX }),
      }),
    mode: z.enum(PROJECT_MODES),
  });
}

/** What the create call answers: the server function's result shape. */
export type CreateProjectOutcome =
  | { ok: true; value: { projectId: string } }
  | { ok: false; error: RefusalCode };

/**
 * The new project form (PR2, PR14): a project name and how the project runs, a Delphi study
 * unless the facilitator picks a Team. A refusal from the server shows at the top of the
 * form; a failed call shows the general error there.
 */
export function NewProjectForm({
  create,
  onCreated,
  actions,
}: Readonly<{
  create: (name: string, mode: ProjectMode) => Promise<CreateProjectOutcome>;
  onCreated: (projectId: string, name: string) => Promise<void> | void;
  /** Controls beside the submit button, such as a cancel link. */
  actions?: ReactNode;
}>) {
  const form = useAppForm({
    defaultValues: { name: "", mode: "delphi" as ProjectMode },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: newProjectSchema() },
    onSubmit: async ({ value, formApi }) => {
      const name = value.name.trim();
      let outcome: CreateProjectOutcome;
      try {
        outcome = await create(name, value.mode);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await onCreated(outcome.value.projectId, name);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="name">
        {(field) => (
          <field.TextField
            label={m.projects_name_label()}
            description={m.projects_name_description({ max: PROJECT_NAME_MAX })}
            autoComplete="off"
          />
        )}
      </form.AppField>
      <form.Field name="mode">
        {(field) => (
          <FieldSet>
            <FieldLegend id="new-project-mode-legend" variant="label">
              {m.projects_mode_heading()}
            </FieldLegend>
            <ModeChoice
              name="new-project-mode"
              value={field.state.value}
              onChange={field.handleChange}
              labelledBy="new-project-mode-legend"
            />
          </FieldSet>
        )}
      </form.Field>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{m.projects_create()}</form.SubmitButton>
        </form.AppForm>
        {actions}
      </div>
    </form>
  );
}
