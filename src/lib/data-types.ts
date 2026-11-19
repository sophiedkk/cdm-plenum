// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The element data types of ADR 0009: each key names an openEHR RM data value type and the
// nearest FHIR R5 data type. NOTE: no specification maps openEHR to FHIR; this pairing is our own
// design, checked against the openEHR RM data types specification and the FHIR R5 data types page.

export const DATA_TYPES = [
  { key: "text", rmType: "DV_TEXT", fhirType: "string" },
  { key: "coded_text", rmType: "DV_CODED_TEXT", fhirType: "CodeableConcept" },
  { key: "quantity", rmType: "DV_QUANTITY", fhirType: "Quantity" },
  { key: "count", rmType: "DV_COUNT", fhirType: "integer" },
  { key: "ordinal", rmType: "DV_ORDINAL", fhirType: "CodeableConcept" },
  { key: "scale", rmType: "DV_SCALE", fhirType: "CodeableConcept" },
  { key: "proportion", rmType: "DV_PROPORTION", fhirType: "Ratio" },
  { key: "boolean", rmType: "DV_BOOLEAN", fhirType: "boolean" },
  { key: "date", rmType: "DV_DATE", fhirType: "date" },
  { key: "date_time", rmType: "DV_DATE_TIME", fhirType: "dateTime" },
  { key: "time", rmType: "DV_TIME", fhirType: "time" },
  { key: "duration", rmType: "DV_DURATION", fhirType: "Duration" },
  { key: "quantity_interval", rmType: "DV_INTERVAL<DV_QUANTITY>", fhirType: "Range" },
  { key: "date_time_interval", rmType: "DV_INTERVAL<DV_DATE_TIME>", fhirType: "Period" },
  { key: "identifier", rmType: "DV_IDENTIFIER", fhirType: "Identifier" },
  { key: "multimedia", rmType: "DV_MULTIMEDIA", fhirType: "Attachment" },
  { key: "uri", rmType: "DV_URI", fhirType: "uri" },
] as const;

export type DataType = (typeof DATA_TYPES)[number];
export type DataTypeKey = DataType["key"];

/** Types whose elements carry a list of proposed values (EL9). */
export const CODED_DATA_TYPE_KEYS: readonly DataTypeKey[] = ["coded_text", "ordinal", "scale"];

export function isDataTypeKey(value: string): value is DataTypeKey {
  return DATA_TYPES.some((type) => type.key === value);
}

export function dataTypeByKey(key: DataTypeKey): DataType {
  const type = DATA_TYPES.find((candidate) => candidate.key === key);
  if (!type) throw new Error(`unknown data type key: ${key}`);
  return type;
}

/**
 * The FHIR type for an RM type name as CKM writes it, or null for an RM type outside the list:
 * such an element keeps its RM name and is exported without a FHIR type.
 */
export function fhirTypeForRmType(rmType: string): string | null {
  return DATA_TYPES.find((type) => type.rmType === rmType)?.fhirType ?? null;
}
