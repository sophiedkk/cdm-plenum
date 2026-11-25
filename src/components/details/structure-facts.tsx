// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The structure of an element (DT1): data type by its plain name, cardinality in words, the units
// of a quantity and the value list. The openEHR and FHIR types and the `min..max` form sit in a
// folded "For modellers" part, open for the facilitator, architects and terminologists (P4, owner
// decision 2026-11-25). A reference to another model has a cardinality only (EL26), so its data
// type is left out.
import { dataTypeName, dataTypePair } from "@/components/board/data-type-text";
import { m } from "@/i18n/messages";
import { describeCardinality, formatCardinality } from "@/lib/cardinality";
import type { DetailStructure } from "@/lib/details";
import { joinUnits } from "@/lib/units";

export function StructureFacts({
  structure,
  reference = false,
  modeller = false,
}: Readonly<{
  structure: DetailStructure;
  reference?: boolean;
  /** Whether the reader is a modeller, so the technical part opens by default. */
  modeller?: boolean;
}>) {
  const { dataType, cardinality, values, units } = structure;
  const technical = !(reference || dataType === null) || cardinality !== null;
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
        {!reference && (
          <>
            <dt className="text-muted-foreground">{m.board_field_data_type()}</dt>
            <dd>{dataType === null ? m.board_not_decided() : dataTypeName(dataType)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{m.board_field_cardinality()}</dt>
        <dd>{cardinality === null ? m.board_not_decided() : describeCardinality(cardinality)}</dd>
        {units.length > 0 && (
          <>
            <dt className="text-muted-foreground">{m.board_field_units()}</dt>
            <dd>{joinUnits(units)}</dd>
          </>
        )}
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
      {technical && (
        <details open={modeller}>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {m.details_modellers()}
          </summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
            {!(reference || dataType === null) && (
              <>
                <dt className="text-muted-foreground">{m.board_field_data_type()}</dt>
                <dd>{dataTypePair(dataType)}</dd>
              </>
            )}
            {cardinality !== null && (
              <>
                <dt className="text-muted-foreground">{m.board_field_cardinality()}</dt>
                <dd>{formatCardinality(cardinality)}</dd>
              </>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}
