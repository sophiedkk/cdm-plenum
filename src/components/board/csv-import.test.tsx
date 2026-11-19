// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CSV import (EL3): a file is required and read as text, the preview shows the accepted rows
// and each refused row with its line and a translated reason, then the import runs once.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { CsvFileError, CsvRowError } from "@/lib/element-csv";
import { CsvImport, csvFileErrorMessage, csvRowErrorMessage } from "./csv-import";

// The `satisfies` checks fail to compile when the reader gains a code these lists lack.
const ROW_ERRORS = [
  "malformed_quotes",
  "field_count",
  "name_missing",
  "name_too_long",
  "description_too_long",
  "data_type_unknown",
  "cardinality_invalid",
] as const satisfies readonly CsvRowError[];
const FILE_ERRORS = [
  "too_large",
  "not_utf8",
  "empty",
  "missing_name_column",
  "missing_description_column",
  "duplicate_column",
  "unterminated_quote",
  "too_many_rows",
] as const satisfies readonly CsvFileError[];

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const CONTENT = "name,description\nSystolic,Peak\n,No name\n";

function chooseFile(text = CONTENT, name = "elements.csv") {
  const file = new File([text], name, { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
}

describe("CSV messages", () => {
  it.each(ROW_ERRORS)("translates the row error %s", (reason) => {
    expect(csvRowErrorMessage(reason)).not.toContain("_");
    overwriteGetLocale(() => "nl");
    expect(csvRowErrorMessage(reason)).toBeTruthy();
  });

  it.each(FILE_ERRORS)("translates the file error %s", (error) => {
    expect(csvFileErrorMessage(error)).toBeTruthy();
  });

  it("adds the line when the reader names one", () => {
    expect(csvFileErrorMessage("unterminated_quote", 4)).toBe(
      "A quoted field is not closed. Line 4.",
    );
  });
});

describe("CsvImport", () => {
  it("needs a file before it asks the server", async () => {
    const preview = vi.fn();
    render(<CsvImport preview={preview} importFile={vi.fn()} onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(await screen.findByText("Choose a CSV file.")).toBeTruthy();
    expect(preview).not.toHaveBeenCalled();
  });

  it("shows a file the server refuses at the file field, translated", async () => {
    const preview = vi.fn(async () => ({
      ok: true as const,
      value: { ok: false as const, error: "missing_name_column" as const, line: 1 },
    }));
    render(<CsvImport preview={preview} importFile={vi.fn()} onImported={vi.fn()} />);
    chooseFile("title\nx\n");
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(await screen.findByText("The header row has no name column. Line 1.")).toBeTruthy();
  });

  it("previews accepted and refused rows, then imports the file once", async () => {
    const preview = vi.fn(async () => ({
      ok: true as const,
      value: {
        ok: true as const,
        separator: "," as const,
        accepted: [
          { line: 2, name: "Systolic", description: "Peak", dataType: null, cardinality: null },
        ],
        refused: [{ line: 3, reason: "name_missing" as const }],
        ignoredColumns: [],
      },
    }));
    const importFile = vi.fn(async () => ({
      ok: true as const,
      value: { ok: true as const, elementIds: ["e1"] },
    }));
    const onImported = vi.fn();
    render(<CsvImport preview={preview} importFile={importFile} onImported={onImported} />);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByLabelText("CSV file").getAttribute("aria-invalid")).toBe("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    await screen.findByRole("heading", { name: "Preview of elements.csv" });
    expect(preview).toHaveBeenCalledWith({
      name: "elements.csv",
      size: CONTENT.length,
      content: CONTENT,
    });
    const refused = screen.getByRole("table", { name: "Rows that are not imported" });
    expect(refused.textContent).toContain("3");
    expect(refused.textContent).toContain("The row has no name.");
    expect(screen.getByRole("table", { name: "Rows to import" }).textContent).toContain("Systolic");
    fireEvent.click(screen.getByRole("button", { name: "Import the accepted rows (1)" }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(1, "elements.csv"));
    expect(importFile).toHaveBeenCalledTimes(1);
  });

  it("shows a refused import as a message", async () => {
    const preview = vi.fn(async () => ({
      ok: true as const,
      value: {
        ok: true as const,
        separator: "," as const,
        accepted: [{ line: 2, name: "A", description: "", dataType: null, cardinality: null }],
        refused: [],
        ignoredColumns: ["unit"],
      },
    }));
    const importFile = vi.fn(async () => ({ ok: false as const, error: "forbidden" as const }));
    render(<CsvImport preview={preview} importFile={importFile} onImported={vi.fn()} />);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByLabelText("CSV file").getAttribute("aria-invalid")).toBe("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(await screen.findByText("These columns are not read: unit.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import the accepted rows (1)" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your role does not allow this.",
    );
  });
});
