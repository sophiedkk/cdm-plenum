// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import type { AnyFieldApi } from "@tanstack/react-form";
import { type ReactNode, useId } from "react";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { type ErrorMessage, errorMessages } from "@/lib/forms/errors";

/** The props every registered field takes: a visible label and optional help text. */
export interface BaseFieldProps {
  /** The visible label (WCAG 1.3.1, 3.3.2); a placeholder never replaces it. */
  readonly label: string;
  /** Help text under the control, linked with `aria-describedby`. */
  readonly description?: ReactNode;
  readonly className?: string;
}

/** The ids and state that tie a field's label, help text and error to its control. */
export interface FieldA11y {
  readonly descriptionId: string;
  readonly errorId: string;
  readonly isInvalid: boolean;
  readonly errors: ErrorMessage[];
  readonly controlProps: {
    readonly id: string;
    readonly name: string;
    readonly "aria-invalid": boolean;
    readonly "aria-describedby": string | undefined;
  };
}

/**
 * The accessibility wiring of a field. An error shows once the field is touched (a submit
 * touches every field); `aria-describedby` names the help text and the error on screen.
 */
export function useFieldA11y(field: AnyFieldApi, description: ReactNode): FieldA11y {
  const base = useId();
  const descriptionId = `${base}description`;
  const errorId = `${base}error`;
  const { meta } = field.state;
  const errors = errorMessages(meta.errors);
  const isInvalid = meta.isTouched && errors.length > 0;
  const describedBy = [description ? descriptionId : null, isInvalid ? errorId : null].filter(
    (id) => id !== null,
  );
  return {
    descriptionId,
    errorId,
    isInvalid,
    errors,
    controlProps: {
      id: `${base}control`,
      name: field.name,
      "aria-invalid": isInvalid,
      "aria-describedby": describedBy.length > 0 ? describedBy.join(" ") : undefined,
    },
  };
}

/** The help text, then the error (an alert, WCAG 3.3.1, 4.1.3). */
export function FieldFeedback({
  a11y,
  description,
}: Readonly<{ a11y: FieldA11y; description: ReactNode }>) {
  return (
    <>
      {description && <FieldDescription id={a11y.descriptionId}>{description}</FieldDescription>}
      {a11y.isInvalid && <FieldError id={a11y.errorId} errors={a11y.errors} />}
    </>
  );
}
