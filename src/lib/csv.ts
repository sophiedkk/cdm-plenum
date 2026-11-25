// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CSV writer of the exports (EX1, EX4): RFC 4180 (https://www.rfc-editor.org/rfc/rfc4180)
// with CRLF line ends, UTF-8 with a byte order mark so spreadsheet programs read the encoding.

/** One cell: text, a number, or nothing (an empty cell). */
export type CsvCell = string | number | null | undefined;

/** The UTF-8 byte order mark, written before the first row. */
export const BOM = "﻿";

// NOTE: OWASP CSV Injection (https://owasp.org/www-community/attacks/CSV_Injection). A text cell
// starting with one of these is read as a formula by spreadsheet programs; the full-width forms
// count in some locales. Such a cell gets a leading single quote.
const FORMULA_START = /^[=+\-@\t\r\n＝＋－＠]/;

/**
 * Writes one cell. Text is always quoted, with inner quotes doubled, as OWASP advises, so a
 * comma, a semicolon (the list separator of Dutch spreadsheets) or a line break never starts a new
 * cell. A number is written as it is; it cannot hold a formula.
 */
export function csvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) throw new Error(`not a finite number: ${cell}`);
    return String(cell);
  }
  const text = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return `"${text.replaceAll('"', '""')}"`;
}

/** The separator between cells: a comma (RFC 4180), or a semicolon for spreadsheet programs set to Dutch. */
export type CsvSeparator = "comma" | "semicolon";

const SEPARATORS: Record<CsvSeparator, string> = { comma: ",", semicolon: ";" };

/** Writes a CSV document: a BOM, then each row as cells joined by the separator, each ended by CRLF. */
export function writeCsv(
  rows: readonly (readonly CsvCell[])[],
  separator: CsvSeparator = "comma",
): string {
  return BOM + rows.map((row) => `${row.map(csvCell).join(SEPARATORS[separator])}\r\n`).join("");
}
