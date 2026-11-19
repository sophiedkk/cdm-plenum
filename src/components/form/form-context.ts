// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFormHookContexts } from "@tanstack/react-form";

/** `useFieldContext` inside a `form.AppField`, `useFormContext` inside a `form.AppForm`. */
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();
