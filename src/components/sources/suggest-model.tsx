// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A participant suggests an existing model by title and link (EL12); the facilitator accepts or
// dismisses it on the Existing models page. Who suggested it stays with the facilitator (EL2).
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/components/form/app-form";
import { FormDialog } from "@/components/members/form-dialog";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { refusalMessage } from "@/lib/i18n/refusals";
import { otherModelSchema } from "./add-model";

export function SuggestModelButton({
  suggest,
  onSuggested,
}: Readonly<{
  suggest: (title: string, link: string | null) => Promise<Outcome<unknown>>;
  onSuggested: () => Promise<void> | void;
}>) {
  return (
    <FormDialog
      title={m.board_suggest_title()}
      description={m.board_suggest_description()}
      trigger={
        <Button type="button" variant="link" className="h-auto px-0 text-muted-foreground">
          {m.board_suggest_title()}
        </Button>
      }
    >
      {({ close, cancel }) => (
        <SuggestForm
          suggest={suggest}
          cancel={cancel}
          done={async () => {
            close();
            await onSuggested();
          }}
        />
      )}
    </FormDialog>
  );
}

function SuggestForm({
  suggest,
  cancel,
  done,
}: Readonly<{
  suggest: (title: string, link: string | null) => Promise<Outcome<unknown>>;
  cancel: React.ReactNode;
  done: () => Promise<void>;
}>) {
  const form = useAppForm({
    defaultValues: { title: "", link: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: otherModelSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: Outcome<unknown>;
      try {
        const link = value.link.trim();
        outcome = await suggest(value.title.trim(), link === "" ? null : link);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await done();
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
      <form.AppField name="title">
        {(field) => <field.TextField label={m.board_models_title_label()} autoComplete="off" />}
      </form.AppField>
      <form.AppField name="link">
        {(field) => (
          <field.TextField
            label={m.board_models_link_label()}
            description={m.board_models_link_description()}
            type="url"
            autoComplete="off"
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{m.board_suggest_submit()}</form.SubmitButton>
        </form.AppForm>
        {cancel}
      </div>
    </form>
  );
}
