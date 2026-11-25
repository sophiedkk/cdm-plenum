// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The codes of an element (DT5): the element code and a code per value of the list, then the
// binding strength with its value set under "For modellers", open for the facilitator, architects
// and terminologists (P4). The detail page, the recap and the hand-off show it.
import { m } from "@/i18n/messages";
import {
  type BindingStrength,
  codeSystemLabel,
  type DetailCode,
  type DetailCodes,
  type DetailValue,
} from "@/lib/details";

const BINDING_LABELS: Record<BindingStrength, () => string> = {
  required: () => m.details_binding_required(),
  extensible: () => m.details_binding_extensible(),
  preferred: () => m.details_binding_preferred(),
  example: () => m.details_binding_example(),
};

/** The name of a binding strength in the active locale. */
export function bindingLabel(strength: BindingStrength): string {
  return BINDING_LABELS[strength]();
}

/** A code as one line: system, code and, when given, its display in quotes. */
export function CodeText({ code }: Readonly<{ code: DetailCode | null }>) {
  if (code === null) return <span className="text-muted-foreground">{m.details_no_code()}</span>;
  return (
    <span>
      {codeSystemLabel(code.system)} <span className="font-mono">{code.code}</span>
      {code.display !== null && <span className="text-muted-foreground"> "{code.display}"</span>}
    </span>
  );
}

export function CodeFacts({
  codes,
  values,
  modeller = false,
}: Readonly<{
  codes: DetailCodes;
  values: readonly DetailValue[];
  /** Whether the reader is a modeller, so the binding opens by default. */
  modeller?: boolean;
}>) {
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">{m.details_element_code()}</dt>
        <dd>
          <CodeText code={codes.code} />
        </dd>
        {values.length > 0 && (
          <>
            <dt className="text-muted-foreground">{m.details_value_codes()}</dt>
            <dd>
              <ol className="list-decimal pl-5">
                {values.map((value, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: values are an ordered list without ids
                  <li key={index}>
                    {value.text}: <CodeText code={codes.valueCodes[index] ?? null} />
                  </li>
                ))}
              </ol>
            </dd>
          </>
        )}
      </dl>
      <details open={modeller}>
        <summary className="cursor-pointer text-sm text-muted-foreground">
          {m.details_modellers()}
        </summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">{m.details_binding()}</dt>
          <dd>
            {codes.bindingStrength === null
              ? m.board_not_decided()
              : bindingLabel(codes.bindingStrength)}
            {codes.valueSetUrl !== null && (
              <span className="block break-all text-muted-foreground">{codes.valueSetUrl}</span>
            )}
          </dd>
        </dl>
      </details>
    </div>
  );
}
