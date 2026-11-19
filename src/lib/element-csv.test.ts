// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CSV reader of the element import (EL3): separators, quotes, line numbers and every refusal.
import { describe, expect, it } from "vitest";
import { CSV_MAX_BYTES, CSV_MAX_ROWS, parseElementCsv } from "./element-csv.ts";

function ok(text: string) {
  const result = parseElementCsv(text);
  if (!result.ok) throw new Error(`file refused: ${result.error}`);
  return result;
}

describe("parseElementCsv", () => {
  it("reads a comma file with the two required columns", () => {
    const result = ok("name,description\nSystolic,Peak pressure\nDiastolic,Lowest pressure\n");
    expect(result.separator).toBe(",");
    expect(result.accepted).toEqual([
      {
        line: 2,
        name: "Systolic",
        description: "Peak pressure",
        dataType: null,
        cardinality: null,
      },
      {
        line: 3,
        name: "Diastolic",
        description: "Lowest pressure",
        dataType: null,
        cardinality: null,
      },
    ]);
    expect(result.refused).toEqual([]);
  });

  it("reads a semicolon file, as a Dutch spreadsheet writes it, with CRLF line ends", () => {
    const result = ok(
      "Name;Description;Data_type;Cardinality\r\nSystolisch;Hoogste druk, in mmHg;quantity;1..1\r\n",
    );
    expect(result.separator).toBe(";");
    expect(result.accepted[0]).toMatchObject({
      name: "Systolisch",
      description: "Hoogste druk, in mmHg",
      dataType: "quantity",
      cardinality: { min: 1, max: 1 },
    });
  });

  it("strips a byte order mark", () => {
    const result = ok("﻿name,description\nPosition,Body position\n");
    expect(result.accepted.map((row) => row.name)).toEqual(["Position"]);
  });

  it("follows an Excel sep= line and counts it in the line numbers", () => {
    const result = ok("sep=;\nname;description\n;no name\n");
    expect(result.separator).toBe(";");
    expect(result.refused).toEqual([{ line: 3, reason: "name_missing" }]);
  });

  it("keeps separators, doubled quotes and line breaks inside quoted fields", () => {
    const result = ok(
      'name,description\n"Cuff size, adult","The ""large"" cuff"\n"Comment","Line one\nline two"\nNext,row\n',
    );
    expect(result.accepted.map((row) => [row.line, row.name, row.description])).toEqual([
      [2, "Cuff size, adult", 'The "large" cuff'],
      [3, "Comment", "Line one\nline two"],
      [5, "Next", "row"],
    ]);
  });

  it("skips blank lines and lines of separators, and keeps the physical line numbers", () => {
    const result = ok("\n\nname;description\n\n;\nA;a\n   \nB;b");
    expect(result.accepted.map((row) => [row.line, row.name])).toEqual([
      [6, "A"],
      [8, "B"],
    ]);
    expect(result.refused).toEqual([]);
  });

  it("accepts the data type key or the openEHR type name, in any case", () => {
    const result = ok(
      "name,description,data_type\nA,,DV_CODED_TEXT\nB,,ordinal\nC,,dv_scale\nD,,\n",
    );
    expect(result.accepted.map((row) => row.dataType)).toEqual([
      "coded_text",
      "ordinal",
      "scale",
      null,
    ]);
  });

  it("refuses a row per problem and reports its line and reason", () => {
    const long = "x".repeat(201);
    const result = ok(
      [
        "name,description,data_type,cardinality",
        ",no name,,",
        `${long},too long,,`,
        "Unknown type,,DV_FOO,",
        "Bad card,,,2..3",
        "Too few,fields",
        "Too,many,fields,here,now",
        '"Quoted"x,after quote,,',
        `Long description,${"d".repeat(4001)},,`,
        "Good,kept,count,0..*",
      ].join("\n"),
    );
    expect(result.refused).toEqual([
      { line: 2, reason: "name_missing" },
      { line: 3, reason: "name_too_long" },
      { line: 4, reason: "data_type_unknown" },
      { line: 5, reason: "cardinality_invalid" },
      { line: 6, reason: "field_count" },
      { line: 7, reason: "field_count" },
      { line: 8, reason: "malformed_quotes" },
      { line: 9, reason: "description_too_long" },
    ]);
    expect(result.accepted).toEqual([
      {
        line: 10,
        name: "Good",
        description: "kept",
        dataType: "count",
        cardinality: { min: 0, max: null },
      },
    ]);
  });

  it("lists header cells it does not read", () => {
    expect(ok("name,description,Owner\nA,a,someone\n").ignoredColumns).toEqual(["Owner"]);
  });

  it("refuses a file without a header naming the name column", () => {
    expect(parseElementCsv("title,description\nA,a\n")).toEqual({
      ok: false,
      error: "missing_name_column",
      line: 1,
    });
    expect(parseElementCsv("Systolic,Peak pressure\n")).toMatchObject({
      ok: false,
      error: "missing_name_column",
    });
  });

  it("refuses a file without a description column", () => {
    expect(parseElementCsv("name\nA\n")).toEqual({
      ok: false,
      error: "missing_description_column",
      line: 1,
    });
  });

  it("refuses a header with a column twice", () => {
    expect(parseElementCsv("name,description,Name\nA,a,b\n")).toMatchObject({
      ok: false,
      error: "duplicate_column",
    });
  });

  it("refuses an empty file, a BOM alone and blank lines alone", () => {
    for (const text of ["", "﻿", "\n\r\n  \n"]) {
      expect(parseElementCsv(text)).toEqual({ ok: false, error: "empty" });
    }
  });

  it("refuses a quote that never closes and names the line the record starts on", () => {
    expect(parseElementCsv('name,description\nA,a\nB,"open\nmore\n')).toEqual({
      ok: false,
      error: "unterminated_quote",
      line: 3,
    });
  });

  it("refuses text that was not UTF-8", () => {
    // What a Windows-1252 "é" becomes when a browser reads the file as UTF-8.
    expect(parseElementCsv("name,description\nCaf�,a\n")).toEqual({
      ok: false,
      error: "not_utf8",
    });
  });

  it(`refuses more than ${CSV_MAX_ROWS} rows, not counting blank lines`, () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `E${i},d`).join("\n");
    expect(ok(`name,description\n${rows(CSV_MAX_ROWS)}\n\n\n`).accepted).toHaveLength(CSV_MAX_ROWS);
    expect(parseElementCsv(`name,description\n${rows(CSV_MAX_ROWS + 1)}`)).toEqual({
      ok: false,
      error: "too_many_rows",
    });
  });

  it(`refuses a file over ${CSV_MAX_BYTES} bytes, counting UTF-8 bytes`, () => {
    // "é" is two bytes in UTF-8, so this is just over the cap in bytes, under it in characters.
    const text = `name,description\nA,${"é".repeat(CSV_MAX_BYTES / 2)}`;
    expect(text.length).toBeLessThan(CSV_MAX_BYTES);
    expect(parseElementCsv(text)).toEqual({ ok: false, error: "too_large" });
  });

  it("reads a last row without a line break and a quoted empty field", () => {
    const result = ok('name,description\nA,""');
    expect(result.accepted).toEqual([
      { line: 2, name: "A", description: "", dataType: null, cardinality: null },
    ]);
  });
});
