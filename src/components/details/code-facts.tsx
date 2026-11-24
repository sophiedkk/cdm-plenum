// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The codes of an element (DT5): the element code, the binding strength with its value set, and
// a code per value of the list. The detail page and the recap of the detail phase show it.
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
}: Readonly<{ codes: DetailCodes; values: readonly DetailValue[] }>) {
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{m.details_element_code()}</dt>
      <dd>
        <CodeText code={codes.code} />
      </dd>
      <dt className="text-muted-foreground">{m.details_binding()}</dt>
      <dd>
        {codes.bindingStrength === null
          ? m.board_not_decided()
          : bindingLabel(codes.bindingStrength)}
        {codes.valueSetUrl !== null && (
          <span className="block break-all text-muted-foreground">{codes.valueSetUrl}</span>
        )}
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
  );
}
