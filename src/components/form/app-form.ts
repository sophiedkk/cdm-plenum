// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFormHook, defaultValidationLogic } from "@tanstack/react-form";
import { keepServerRefusals } from "@/lib/forms/server-refusal";
import { FormErrors, SubmitButton } from "./form-components";
import { fieldContext, formContext } from "./form-context";
import { SelectField } from "./select-field";
import { TextareaField, TextField } from "./text-fields";

const formHook = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, SelectField },
  formComponents: { SubmitButton, FormErrors },
});

/**
 * The one form hook of cdm-plenum. It takes TanStack Form's options (`defaultValues`, the Zod
 * schema the server function validates with, `onSubmit`); `form.AppField` renders the
 * registered fields and `form.AppForm` provides `form.SubmitButton` and `form.FormErrors`. A
 * server refusal stays until the user changes that field or submits again.
 */
export const useAppForm: typeof formHook.useAppForm = (options) =>
  formHook.useAppForm({
    ...options,
    validationLogic: keepServerRefusals(options.validationLogic ?? defaultValidationLogic),
  });

export const { withForm } = formHook;
