// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useStore } from "@tanstack/react-form";
import { CircleAlertIcon, Loader2Icon } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { errorMessages } from "@/lib/forms/errors";
import { fieldRefusalNumber, formRefusal } from "@/lib/forms/server-refusal";
import { useFormContext } from "./form-context";

/** A control that shows an error. */
const INVALID_CONTROL = '[aria-invalid="true"]';

function focusFirstInvalid(form: HTMLFormElement | null | undefined): void {
  // After this frame the submit has validated and the errors have rendered.
  requestAnimationFrame(() => form?.querySelector<HTMLElement>(INVALID_CONTROL)?.focus());
}

/**
 * The submit button. It stays enabled while the form is invalid, so a submit shows every error
 * and moves focus to the first invalid control (WCAG 3.3.1); while the form submits it shows a
 * spinner and cannot submit twice. A server refusal that marks a field moves focus there too,
 * unless the refusal also has a form message, which `FormErrors` focuses.
 */
export function SubmitButton({
  children,
  icon,
  ...button
}: Omit<ComponentProps<typeof Button>, "type" | "disabled" | "asChild"> & {
  readonly icon?: ReactNode;
}) {
  const form = useFormContext();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const refusalNumber = useStore(form.store, () => fieldRefusalNumber(form));
  const own = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (refusalNumber === undefined || formRefusal(form, form.state) !== undefined) return;
    focusFirstInvalid(own.current?.form);
  }, [form, refusalNumber]);
  return (
    <Button
      {...button}
      ref={own}
      type="submit"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
      onClick={(event) => {
        button.onClick?.(event);
        focusFirstInvalid(event.currentTarget.form);
      }}
    >
      {isSubmitting ? (
        <Loader2Icon
          aria-hidden="true"
          data-icon="inline-start"
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        icon
      )}
      {children}
    </Button>
  );
}

const SEPARATOR = "\u001f";

/**
 * The form-level errors at the top of the form: a server refusal that concerns no single field.
 * Focus moves to them when they appear and for each new refusal (WCAG 3.3.1).
 */
export function FormErrors() {
  const form = useFormContext();
  // One joined string, so the component renders only when the refusal changes.
  const selected = useStore(form.store, (state) => {
    const refusal = formRefusal(form, state);
    const messages = errorMessages([state.errors, refusal?.message]).map((error) => error.message);
    return messages.length === 0 ? "" : [refusal?.sequence ?? 0, ...messages].join(SEPARATOR);
  });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected !== "") ref.current?.focus();
  }, [selected]);
  if (selected === "") return null;
  const messages = selected.split(SEPARATOR).slice(1);
  return (
    <Alert ref={ref} tabIndex={-1} variant="destructive" className="outline-none">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{m.common_form_errors_title()}</AlertTitle>
      <AlertDescription>
        {messages.length === 1 ? (
          messages[0]
        ) : (
          <ul className="list-disc pl-4">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
