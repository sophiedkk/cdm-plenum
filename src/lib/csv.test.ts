// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { BOM, csvCell, writeCsv } from "./csv";

describe("csvCell", () => {
  it("quotes text and doubles inner quotes (RFC 4180, 2.6 and 2.7)", () => {
    expect(csvCell("plain")).toBe('"plain"');
    expect(csvCell('say "mmHg"')).toBe('"say ""mmHg"""');
  });

  it("keeps separators and line breaks inside one quoted cell", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("line 1\r\nline 2\nline 3")).toBe('"line 1\r\nline 2\nline 3"');
  });

  it("prefixes a text that starts like a formula with a single quote (OWASP)", () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠"]) {
      expect(csvCell(`${start}1+2`)).toBe(`"'${start}1+2"`);
    }
    expect(csvCell('=1+2";=1+2')).toBe('"\'=1+2"";=1+2"');
  });

  it("leaves a formula character later in the text alone", () => {
    expect(csvCell("1+2=3")).toBe('"1+2=3"');
    expect(csvCell(" =1")).toBe('" =1"');
  });

  it("writes numbers without quotes and without a prefix", () => {
    expect(csvCell(7)).toBe("7");
    expect(csvCell(-1)).toBe("-1");
    expect(csvCell(1.5)).toBe("1.5");
  });

  it("refuses a number that has no CSV form", () => {
    expect(() => csvCell(Number.NaN)).toThrow(/not a finite number/);
    expect(() => csvCell(Number.POSITIVE_INFINITY)).toThrow(/not a finite number/);
  });

  it("writes null and undefined as an empty cell, an empty text as an empty quoted cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("")).toBe('""');
  });

  it("keeps Dutch and Greek letters as they are", () => {
    expect(csvCell("bloeddruk, zittend (ëën)")).toBe('"bloeddruk, zittend (ëën)"');
    expect(csvCell("Αρτηριακή πίεση")).toBe('"Αρτηριακή πίεση"');
  });
});

describe("writeCsv", () => {
  it("starts with a UTF-8 byte order mark and ends every row with CRLF", () => {
    const csv = writeCsv([
      ["name", "score"],
      ["Systolisch", 7],
      ["Διαστολική", null],
    ]);
    expect(csv).toBe(`${BOM}"name","score"\r\n"Systolisch",7\r\n"Διαστολική",\r\n`);
    expect(new TextEncoder().encode(csv).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
  });

  it("writes only the byte order mark for no rows", () => {
    expect(writeCsv([])).toBe(BOM);
  });

  it("writes an empty row as an empty line", () => {
    expect(writeCsv([[]])).toBe(`${BOM}\r\n`);
  });
});
