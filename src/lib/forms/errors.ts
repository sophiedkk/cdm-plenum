// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// TanStack Form keeps an error as a string (a validator function or a server refusal), a
// Standard Schema issue with a `message` (Zod), or an array of these.

/** One error as the shadcn `FieldError` renders it. */
export interface ErrorMessage {
  readonly message: string;
}

function collect(error: unknown, into: string[]): void {
  if (typeof error === "string") {
    if (error !== "") into.push(error);
  } else if (Array.isArray(error)) {
    for (const item of error) collect(item, into);
  } else if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message !== ""
  ) {
    into.push(error.message);
  }
}

/** Returns the messages of TanStack Form errors, each once, in order; skips empty slots. */
export function errorMessages(errors: readonly unknown[]): ErrorMessage[] {
  const messages: string[] = [];
  collect(errors, messages);
  return [...new Set(messages)].map((message) => ({ message }));
}
