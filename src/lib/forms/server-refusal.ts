// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Server refusals in a TanStack Form, after the eduLIMS form foundation (ADR 0002): a refusal
// shows at the field it concerns or at the top of the form, and stays until the user changes a
// value or submits again (WCAG 3.3.1).
import type {
  AnyFormApi,
  DeepKeys,
  ValidationLogicFn,
  ValidationLogicValidatorsFn,
} from "@tanstack/react-form";

/** A refusal, already translated: a message for the whole form and one per field it concerns. */
export interface ServerRefusal<TFormData> {
  readonly form?: string;
  readonly fields?: Partial<Record<DeepKeys<TFormData>, string>>;
}

interface RefusalMoment {
  readonly submissionAttempts: number;
  readonly values: unknown;
}

interface FormRefusal extends RefusalMoment {
  readonly message: string;
  readonly sequence: number;
}

// Keyed by the form store: the components get a copy of the FormApi that `onSubmit` receives,
// and both share one store.
const formRefusals = new WeakMap<object, FormRefusal>();
const fieldRefusals = new WeakMap<object, number>();
let sequence = 0;

/**
 * Shows `refusal` in the form. A field message sits in the `onServer` slot of that field's
 * error map; a form message is kept with the submit and the values it belongs to.
 */
export function applyServerRefusal<TFormData>(
  form: Pick<AnyFormApi, "setErrorMap" | "store"> & {
    readonly state: { readonly values: TFormData; readonly submissionAttempts: number };
  },
  refusal: ServerRefusal<TFormData>,
): void {
  if (refusal.form) {
    sequence += 1;
    formRefusals.set(form.store, {
      message: refusal.form,
      sequence,
      submissionAttempts: form.state.submissionAttempts,
      values: form.state.values,
    });
  } else {
    formRefusals.delete(form.store);
  }
  if (Object.values(refusal.fields ?? {}).some((message) => message)) {
    sequence += 1;
    fieldRefusals.set(form.store, sequence);
  }
  // Notifies every subscriber of the store, so `FormErrors` reads the new form refusal as well.
  form.setErrorMap({ onServer: { fields: refusal.fields ?? {} } });
}

/**
 * The form refusal that still holds for `state`: given at this submit, with no value changed
 * since. Pass the state a store selector receives, so the caller stays reactive.
 */
export function formRefusal(
  form: Pick<AnyFormApi, "store">,
  state: RefusalMoment,
): { readonly message: string; readonly sequence: number } | undefined {
  const refusal = formRefusals.get(form.store);
  if (
    refusal === undefined ||
    refusal.submissionAttempts !== state.submissionAttempts ||
    refusal.values !== state.values
  ) {
    return undefined;
  }
  return { message: refusal.message, sequence: refusal.sequence };
}

/** The number of the latest refusal that marked a field; a new number is a new refusal. */
export function fieldRefusalNumber(form: Pick<AnyFormApi, "store">): number | undefined {
  return fieldRefusals.get(form.store);
}

const clearServerRefusal: ValidationLogicValidatorsFn = { fn: () => undefined, cause: "server" };

/**
 * Wraps a validation logic so the `onServer` slot clears only when that field changes or the
 * form is submitted again. TanStack Form clears it at any blur, so a click on the submit
 * button would remove the refusal before the user read it.
 */
export function keepServerRefusals(logic: ValidationLogicFn): ValidationLogicFn {
  return (props) => {
    const { event } = props;
    const clears =
      !event.async &&
      (event.type === "submit" || (event.type === "change" && event.fieldName !== undefined));
    return logic({
      ...props,
      runValidation: ({ validators, form }) => {
        const kept = validators.filter((validator) => validator?.cause !== "server");
        return props.runValidation({
          validators: clears ? [...kept, clearServerRefusal] : kept,
          form,
        });
      },
    });
  };
}
