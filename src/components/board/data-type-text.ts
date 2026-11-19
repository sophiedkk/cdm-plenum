// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The translated name and the "when to use" text of each data type (EL1, ADR 0009). The texts
// follow the class descriptions and misuse notes of the openEHR RM data types specification
// (https://specifications.openehr.org/releases/RM/development/data_types.html).
import { m } from "@/i18n/messages";
import { DATA_TYPES, type DataTypeKey, dataTypeByKey } from "@/lib/data-types";

interface DataTypeText {
  name: () => string;
  help: () => string;
}

const TEXTS: Record<DataTypeKey, DataTypeText> = {
  text: { name: () => m.board_type_text_name(), help: () => m.board_type_text_help() },
  coded_text: {
    name: () => m.board_type_coded_text_name(),
    help: () => m.board_type_coded_text_help(),
  },
  quantity: { name: () => m.board_type_quantity_name(), help: () => m.board_type_quantity_help() },
  count: { name: () => m.board_type_count_name(), help: () => m.board_type_count_help() },
  ordinal: { name: () => m.board_type_ordinal_name(), help: () => m.board_type_ordinal_help() },
  scale: { name: () => m.board_type_scale_name(), help: () => m.board_type_scale_help() },
  proportion: {
    name: () => m.board_type_proportion_name(),
    help: () => m.board_type_proportion_help(),
  },
  boolean: { name: () => m.board_type_boolean_name(), help: () => m.board_type_boolean_help() },
  date: { name: () => m.board_type_date_name(), help: () => m.board_type_date_help() },
  date_time: {
    name: () => m.board_type_date_time_name(),
    help: () => m.board_type_date_time_help(),
  },
  time: { name: () => m.board_type_time_name(), help: () => m.board_type_time_help() },
  duration: { name: () => m.board_type_duration_name(), help: () => m.board_type_duration_help() },
  quantity_interval: {
    name: () => m.board_type_quantity_interval_name(),
    help: () => m.board_type_quantity_interval_help(),
  },
  date_time_interval: {
    name: () => m.board_type_date_time_interval_name(),
    help: () => m.board_type_date_time_interval_help(),
  },
  identifier: {
    name: () => m.board_type_identifier_name(),
    help: () => m.board_type_identifier_help(),
  },
  multimedia: {
    name: () => m.board_type_multimedia_name(),
    help: () => m.board_type_multimedia_help(),
  },
  uri: { name: () => m.board_type_uri_name(), help: () => m.board_type_uri_help() },
};

/** The plain name of a data type in the active locale, such as "Quantity". */
export function dataTypeName(key: DataTypeKey): string {
  return TEXTS[key].name();
}

/** When to use the data type, and when not, in the active locale. */
export function dataTypeHelp(key: DataTypeKey): string {
  return TEXTS[key].help();
}

/** The two type names side by side, as ADR 0009 shows them: `DV_QUANTITY / Quantity`. */
export function dataTypePair(key: DataTypeKey): string {
  const type = dataTypeByKey(key);
  return `${type.rmType} / ${type.fhirType}`;
}

export const DATA_TYPE_KEYS: readonly DataTypeKey[] = DATA_TYPES.map((type) => type.key);
