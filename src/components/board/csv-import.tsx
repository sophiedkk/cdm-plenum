// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CSV import of candidate elements (EL3): choose a file, see which rows the server accepts
// and which it refuses (line and reason), then import. The browser reads the file as UTF-8
// text; the server parses it again on import and never trusts rows the browser sends back.
import { revalidateLogic } from "@tanstack/react-form";
import { CircleAlertIcon, FileUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { type BaseFieldProps, FieldFeedback, useFieldA11y } from "@/components/form/field-a11y";
import { useFieldContext } from "@/components/form/form-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import {
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  type CsvFileError,
  type CsvParseResult,
  type CsvRowError,
} from "@/lib/element-csv";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { dataTypeName } from "./data-type-text";

type Outcome<T> = { ok: true; value: T } | { ok: false; error: RefusalCode };

export interface CsvFile {
  name: string;
  size: number;
  /** The file read as UTF-8; empty when it is over the size limit and was not read. */
  content: string;
}

const ROW_ERRORS: Record<CsvRowError, () => string> = {
  malformed_quotes: () => m.board_csv_row_malformed_quotes(),
  field_count: () => m.board_csv_row_field_count(),
  name_missing: () => m.board_csv_row_name_missing(),
  name_too_long: () => m.board_csv_row_name_too_long(),
  description_too_long: () => m.board_csv_row_description_too_long(),
  data_type_unknown: () => m.board_csv_row_data_type_unknown(),
  cardinality_invalid: () => m.board_csv_row_cardinality_invalid(),
};

const FILE_ERRORS: Record<CsvFileError, () => string> = {
  too_large: () => m.board_csv_file_too_large(),
  not_utf8: () => m.board_csv_file_not_utf8(),
  empty: () => m.board_csv_file_empty(),
  missing_name_column: () => m.board_csv_file_missing_name_column(),
  missing_description_column: () => m.board_csv_file_missing_description_column(),
  duplicate_column: () => m.board_csv_file_duplicate_column(),
  unterminated_quote: () => m.board_csv_file_unterminated_quote(),
  too_many_rows: () => m.board_csv_file_too_many_rows({ max: CSV_MAX_ROWS }),
};

/** Why a row is refused, in the active locale. */
export function csvRowErrorMessage(reason: CsvRowError): string {
  return ROW_ERRORS[reason]();
}

/** Why the whole file is refused, with the line when the reader names one. */
export function csvFileErrorMessage(error: CsvFileError, line?: number): string {
  const message = FILE_ERRORS[error]();
  return line === undefined ? message : `${message} ${m.board_csv_file_line({ line })}`;
}

/** The file must be chosen and at most 1 MiB (EL3). */
export function csvFileSchema() {
  return z.object({
    file: z
      .custom<CsvFile | null>()
      .refine((file) => file !== null, { error: () => m.board_import_file_required() })
      .refine((file) => file === null || file.size <= CSV_MAX_BYTES, {
        error: () => m.board_csv_file_too_large(),
      }),
  });
}

/** A file input whose value is the chosen file, read as UTF-8 text. */
function CsvFileField({ label, description }: BaseFieldProps) {
  const field = useFieldContext<CsvFile | null>();
  const a11y = useFieldA11y(field, description);
  return (
    <Field data-invalid={a11y.isInvalid}>
      <FieldLabel htmlFor={a11y.controlProps.id}>{label}</FieldLabel>
      <Input
        {...a11y.controlProps}
        type="file"
        accept=".csv,text/csv"
        onBlur={field.handleBlur}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            field.handleChange(null);
            return;
          }
          // File.text() decodes as UTF-8; the server reports a file in another encoding.
          const content = file.size <= CSV_MAX_BYTES ? await file.text() : "";
          field.handleChange({ name: file.name, size: file.size, content });
        }}
      />
      <FieldFeedback a11y={a11y} description={description} />
    </Field>
  );
}

type Preview = { file: CsvFile; result: Extract<CsvParseResult, { ok: true }> };

export function CsvImport({
  preview,
  importFile,
  onImported,
}: Readonly<{
  preview: (file: CsvFile) => Promise<Outcome<CsvParseResult>>;
  importFile: (
    file: CsvFile,
  ) => Promise<
    Outcome<{ ok: true; elementIds: string[] } | { ok: false; error: CsvFileError; line?: number }>
  >;
  onImported: (count: number, fileName: string) => Promise<void> | void;
}>) {
  const [shown, setShown] = useState<Preview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (importError) errorRef.current?.focus();
  }, [importError]);

  const form = useAppForm({
    defaultValues: { file: null as CsvFile | null },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: csvFileSchema() },
    listeners: { onChange: () => setShown(null) },
    onSubmit: async ({ value, formApi }) => {
      const file = value.file;
      if (!file) return;
      setImportError(null);
      let outcome: Outcome<CsvParseResult>;
      try {
        outcome = await preview(file);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      if (!outcome.value.ok) {
        applyServerRefusal(formApi, {
          fields: { file: csvFileErrorMessage(outcome.value.error, outcome.value.line) },
        });
        return;
      }
      setShown({ file, result: outcome.value });
      requestAnimationFrame(() => previewHeading.current?.focus());
    },
  });

  async function runImport(current: Preview) {
    setImportError(null);
    setImporting(true);
    try {
      const outcome = await importFile(current.file);
      if (!outcome.ok) setImportError(refusalMessage(outcome.error));
      else if (!outcome.value.ok)
        setImportError(csvFileErrorMessage(outcome.value.error, outcome.value.line));
      else await onImported(outcome.value.elementIds.length, current.file.name);
    } catch {
      setImportError(m.common_error_unexpected());
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        noValidate
        className="flex max-w-xl flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <form.FormErrors />
        </form.AppForm>
        <form.AppField name="file">
          {() => (
            <CsvFileField
              label={m.board_import_file_label()}
              description={m.board_import_file_description({ rows: CSV_MAX_ROWS })}
            />
          )}
        </form.AppField>
        <div>
          <form.AppForm>
            <form.SubmitButton variant="outline">{m.board_import_preview()}</form.SubmitButton>
          </form.AppForm>
        </div>
      </form>

      {shown && (
        <section aria-labelledby="csv-preview" className="flex flex-col gap-6">
          <h3
            id="csv-preview"
            ref={previewHeading}
            tabIndex={-1}
            className="type-section outline-none"
          >
            {m.board_import_preview_heading({ file: shown.file.name })}
          </h3>
          <p>
            {m.board_import_summary({
              accepted: shown.result.accepted.length,
              refused: shown.result.refused.length,
            })}
          </p>
          {shown.result.ignoredColumns.length > 0 && (
            <p className="text-muted-foreground">
              {m.board_import_ignored({ columns: shown.result.ignoredColumns.join(", ") })}
            </p>
          )}
          {shown.result.refused.length > 0 && (
            <Table aria-label={m.board_import_refused_heading()}>
              <TableCaption className="caption-top text-left font-medium text-foreground">
                {m.board_import_refused_heading()}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{m.board_import_column_line()}</TableHead>
                  <TableHead scope="col">{m.board_import_column_reason()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.result.refused.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell>{row.line}</TableCell>
                    <TableCell className="whitespace-normal">
                      {csvRowErrorMessage(row.reason)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {shown.result.accepted.length > 0 && (
            <Table aria-label={m.board_import_accepted_heading()}>
              <TableCaption className="caption-top text-left font-medium text-foreground">
                {m.board_import_accepted_heading()}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{m.board_import_column_line()}</TableHead>
                  <TableHead scope="col">{m.board_name_label()}</TableHead>
                  <TableHead scope="col">{m.board_description_label()}</TableHead>
                  <TableHead scope="col">{m.board_field_data_type()}</TableHead>
                  <TableHead scope="col">{m.board_field_cardinality()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.result.accepted.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell>{row.line}</TableCell>
                    <TableCell className="whitespace-normal">{row.name}</TableCell>
                    <TableCell className="whitespace-normal">{row.description}</TableCell>
                    <TableCell>
                      {row.dataType === null ? m.board_not_decided() : dataTypeName(row.dataType)}
                    </TableCell>
                    <TableCell>
                      {row.cardinality === null
                        ? m.board_not_decided()
                        : formatCardinality(row.cardinality)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {importError && (
            <Alert ref={errorRef} tabIndex={-1} variant="destructive" className="outline-none">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{m.board_import_failed_title()}</AlertTitle>
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          )}
          <div>
            <Button
              type="button"
              disabled={shown.result.accepted.length === 0 || importing}
              aria-busy={importing}
              onClick={() => void runImport(shown)}
            >
              <FileUpIcon aria-hidden="true" data-icon="inline-start" />
              {shown.result.accepted.length === 0
                ? m.board_import_none_accepted()
                : m.board_import_submit({ count: shown.result.accepted.length })}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
