// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Reads candidate elements from a CSV file (EL3). The format is RFC 4180
// (https://www.rfc-editor.org/rfc/rfc4180): fields in double quotes may hold the separator, line
// breaks and doubled quotes. Spreadsheets in Dutch and other locales write a semicolon instead of
// a comma, so the header decides the separator. Pure: the preview and the import run the same code.
import { type Cardinality, parseCardinality } from "./cardinality.ts";
import { DATA_TYPES, type DataTypeKey } from "./data-types.ts";
import { ELEMENT_DESCRIPTION_MAX, ELEMENT_NAME_MAX } from "./elements.ts";

// NOTE: no requirement sets these; our own design. One concept's board holds tens to a few
// hundred candidates, and 1,000 rows of 1 KB each fit in 1 MiB, so neither cap stops a real
// import while both keep one request small enough to parse and write in one transaction.
export const CSV_MAX_BYTES = 1_048_576;
export const CSV_MAX_ROWS = 1_000;

/** The columns the import reads; `name` and `description` are required. */
export const CSV_COLUMNS = ["name", "description", "data_type", "cardinality"] as const;
type CsvColumn = (typeof CSV_COLUMNS)[number];

export type CsvSeparator = "," | ";";

export interface CsvElementRow {
  /** The line of the file where the row starts; the header is line 1. */
  line: number;
  name: string;
  description: string;
  dataType: DataTypeKey | null;
  cardinality: Cardinality | null;
}

export type CsvRowError =
  | "malformed_quotes"
  | "field_count"
  | "name_missing"
  | "name_too_long"
  | "description_too_long"
  | "data_type_unknown"
  | "cardinality_invalid";

export interface CsvRefusedRow {
  line: number;
  reason: CsvRowError;
}

export type CsvFileError =
  | "too_large"
  | "not_utf8"
  | "empty"
  | "missing_name_column"
  | "missing_description_column"
  | "duplicate_column"
  | "unterminated_quote"
  | "too_many_rows";

export type CsvParseResult =
  | {
      ok: true;
      separator: CsvSeparator;
      accepted: CsvElementRow[];
      refused: CsvRefusedRow[];
      /** Header cells the import does not read, as written in the file. */
      ignoredColumns: string[];
    }
  | { ok: false; error: CsvFileError; line?: number };

interface CsvRecord {
  line: number;
  fields: string[];
  /** Text after a closing quote, as in `"a"b`. */
  malformed: boolean;
}

type Tokens = { ok: true; records: CsvRecord[] } | { ok: false; line: number };

/** Splits `text` into records; line breaks are CRLF, LF or CR. */
function tokenize(text: string, separator: string, firstLine: number): Tokens {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let inQuotes = false;
  let afterQuote = false;
  let malformed = false;
  let line = firstLine;
  let recordLine = firstLine;
  const endField = () => {
    fields.push(field);
    field = "";
    quoted = false;
    afterQuote = false;
  };
  const endRecord = () => {
    records.push({ line: recordLine, fields, malformed });
    fields = [];
    malformed = false;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    const crlf = c === "\r" && text[i + 1] === "\n";
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          afterQuote = true;
          i += 1;
        }
        continue;
      }
      if (c === "\n" || c === "\r") line += 1;
      field += crlf ? "\r\n" : c;
      i += crlf ? 2 : 1;
      continue;
    }
    if (c === separator) {
      endField();
      i += 1;
    } else if (c === "\n" || c === "\r") {
      endField();
      endRecord();
      i += crlf ? 2 : 1;
      line += 1;
      recordLine = line;
    } else if (c === '"' && field === "" && !quoted) {
      inQuotes = true;
      quoted = true;
      i += 1;
    } else {
      if (afterQuote) malformed = true;
      field += c;
      i += 1;
    }
  }
  if (inQuotes) return { ok: false, line: recordLine };
  if (field !== "" || quoted || fields.length > 0) {
    endField();
    endRecord();
  }
  return { ok: true, records };
}

function isBlank(record: CsvRecord): boolean {
  return record.fields.every((field) => field.trim() === "");
}

function headerKey(cell: string): string {
  return cell.trim().toLowerCase();
}

/** The separator whose header split names a `name` column; the comma on a tie. */
function pickSeparator(headerLine: string): CsvSeparator | null {
  const candidates = ([",", ";"] as const)
    .map((separator) => {
      const tokens = tokenize(headerLine, separator, 1);
      const cells = tokens.ok ? (tokens.records[0]?.fields ?? []) : [];
      return { separator, cells: cells.map(headerKey) };
    })
    .filter((candidate) => candidate.cells.includes("name"))
    .sort((a, b) => b.cells.length - a.cells.length);
  return candidates[0]?.separator ?? null;
}

function dataTypeOf(cell: string): DataTypeKey | null | undefined {
  const text = cell.trim();
  if (text === "") return null;
  const found = DATA_TYPES.find(
    (type) => type.key === text.toLowerCase() || type.rmType === text.toUpperCase(),
  );
  return found?.key;
}

function readRow(
  record: CsvRecord,
  columns: Map<CsvColumn, number>,
  width: number,
): CsvElementRow | CsvRowError {
  if (record.malformed) return "malformed_quotes";
  if (record.fields.length !== width) return "field_count";
  const cell = (column: CsvColumn) => {
    const index = columns.get(column);
    return index === undefined ? "" : (record.fields[index] ?? "");
  };
  const name = cell("name").trim();
  if (name === "") return "name_missing";
  if (name.length > ELEMENT_NAME_MAX) return "name_too_long";
  const description = cell("description").trim();
  if (description.length > ELEMENT_DESCRIPTION_MAX) return "description_too_long";
  const dataType = dataTypeOf(cell("data_type"));
  if (dataType === undefined) return "data_type_unknown";
  const cardinalityText = cell("cardinality").trim();
  const cardinality = cardinalityText === "" ? null : parseCardinality(cardinalityText);
  if (cardinalityText !== "" && cardinality === null) return "cardinality_invalid";
  return { line: record.line, name, description, dataType, cardinality };
}

/**
 * Reads a CSV file of candidate elements. A file error refuses the whole file; a row error
 * refuses that row only and reports its line. Blank lines are skipped. The data type is a key of
 * the data type list or its openEHR type name (`coded_text` or `DV_CODED_TEXT`); the cardinality
 * is written as `0..1` or `1..*`.
 */
export function parseElementCsv(input: string): CsvParseResult {
  if (new TextEncoder().encode(input).byteLength > CSV_MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }
  // A file in another encoding, read as UTF-8, has replacement characters where it differs.
  if (input.includes("�")) return { ok: false, error: "not_utf8" };
  let text = input.startsWith("﻿") ? input.slice(1) : input;
  let firstLine = 1;
  // Excel writes and reads a first line `sep=;` that names the separator.
  const hint = /^sep=([,;])\r?\n/i.exec(text);
  let separator: CsvSeparator | null = null;
  if (hint) {
    separator = hint[1] as CsvSeparator;
    text = text.slice(hint[0].length);
    firstLine = 2;
  }
  const leading = /^(?:[ \t]*(?:\r\n|\n|\r))*/.exec(text)?.[0] ?? "";
  firstLine += (leading.match(/\r\n|\n|\r/g) ?? []).length;
  text = text.slice(leading.length);
  if (text.trim() === "") return { ok: false, error: "empty" };

  const headerLine = /^[^\r\n]*/.exec(text)?.[0] ?? "";
  separator ??= pickSeparator(headerLine);
  if (separator === null) return { ok: false, error: "missing_name_column", line: firstLine };
  const tokens = tokenize(text, separator, firstLine);
  if (!tokens.ok) return { ok: false, error: "unterminated_quote", line: tokens.line };
  const [header, ...rows] = tokens.records;
  if (header === undefined) return { ok: false, error: "empty" };

  const columns = new Map<CsvColumn, number>();
  const ignoredColumns: string[] = [];
  for (const [index, cell] of header.fields.entries()) {
    const key = headerKey(cell);
    const column = CSV_COLUMNS.find((name) => name === key);
    if (column === undefined) {
      ignoredColumns.push(cell.trim());
    } else if (columns.has(column)) {
      return { ok: false, error: "duplicate_column", line: header.line };
    } else {
      columns.set(column, index);
    }
  }
  if (!columns.has("name")) return { ok: false, error: "missing_name_column", line: header.line };
  if (!columns.has("description")) {
    return { ok: false, error: "missing_description_column", line: header.line };
  }

  const dataRows = rows.filter((record) => !isBlank(record));
  if (dataRows.length > CSV_MAX_ROWS) return { ok: false, error: "too_many_rows" };
  const accepted: CsvElementRow[] = [];
  const refused: CsvRefusedRow[] = [];
  for (const record of dataRows) {
    const row = readRow(record, columns, header.fields.length);
    if (typeof row === "string") refused.push({ line: record.line, reason: row });
    else accepted.push(row);
  }
  return { ok: true, separator, accepted, refused, ignoredColumns };
}
