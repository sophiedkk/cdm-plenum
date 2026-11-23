// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The structure of an element (DT1): data type in neutral words with its openEHR and FHIR types,
// cardinality and the value list. The detail page and the recap of the detail phase show it.
import { dataTypeName, dataTypePair } from "@/components/board/data-type-text";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import type { DetailStructure } from "@/lib/details";

export function StructureFacts({ structure }: Readonly<{ structure: DetailStructure }>) {
  const { dataType, cardinality, values } = structure;
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{m.board_field_data_type()}</dt>
      <dd>
        {dataType === null
          ? m.board_not_decided()
          : `${dataTypeName(dataType)} (${dataTypePair(dataType)})`}
      </dd>
      <dt className="text-muted-foreground">{m.board_field_cardinality()}</dt>
      <dd>{cardinality === null ? m.board_not_decided() : formatCardinality(cardinality)}</dd>
      {values.length > 0 && (
        <>
          <dt className="text-muted-foreground">{m.board_field_values()}</dt>
          <dd>
            <ol className="list-decimal pl-5">
              {values.map((value, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: values are an ordered list without ids
                <li key={index}>
                  {value.text}
                  {value.value !== null && (
                    <span className="text-muted-foreground"> ({value.value})</span>
                  )}
                </li>
              ))}
            </ol>
          </dd>
        </>
      )}
    </dl>
  );
}
