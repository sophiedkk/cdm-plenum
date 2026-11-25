// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CKM search of the board (EL4, EL7): search archetypes, open one to see its elements, then
// link an element of the board to one of them or import them all. Every CKM failure shows as a
// translated message inside the dialog; the board itself never waits on CKM (R-06).
import { revalidateLogic } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, CircleAlertIcon, LinkIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import type { CkmArchetype } from "@/server/ckm/client";
import type { CkmArchetypeView, CkmElementView } from "@/server/ckm/queries";
import { archetypeElementsQueryOptions } from "@/server/elements/query-options";

type Outcome<T> = { ok: true; value: T } | { ok: false; error: RefusalCode };
/** A refusal code, or "unexpected" for a call that failed without one. */
type ErrorCode = RefusalCode | "unexpected";

/** The CKM calls the panel makes; the route passes the server functions. */
export interface CkmActions {
  search: (text: string) => Promise<Outcome<CkmArchetype[]>>;
  link: (archetype: CkmArchetypeView, element: CkmElementView) => Promise<Outcome<unknown>>;
}

const SEARCH_TEXT_MAX = 200;

export function ckmSearchSchema() {
  return z.object({
    text: z
      .string()
      .trim()
      .min(1, { error: () => m.board_ckm_search_required() })
      .max(SEARCH_TEXT_MAX, { error: () => m.board_text_too_long({ max: SEARCH_TEXT_MAX }) }),
  });
}

function occurrences(element: CkmElementView): string {
  const value = element.occurrences;
  if (!value) return m.board_not_decided();
  return `${value.min}..${value.max === null ? "*" : value.max}`;
}

function rmTypes(element: CkmElementView): string {
  return element.rmTypes.length === 0 ? m.board_ckm_any_type() : element.rmTypes.join(" | ");
}

function CkmError({ error }: Readonly<{ error: ErrorCode }>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Alert ref={ref} tabIndex={-1} variant="destructive" className="outline-none">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{m.board_ckm_error_title()}</AlertTitle>
      <AlertDescription>{refusalMessage(error)}</AlertDescription>
    </Alert>
  );
}

/**
 * The panel inside the CKM dialog: it links `linkTarget` to an archetype element (EL4). Whole
 * models are imported on Existing models (EL7, ADR 0020).
 */
export function CkmPanel({
  projectId,
  linkTarget,
  actions,
  onDone,
}: Readonly<{
  projectId: string;
  linkTarget: { id: string; name: string };
  actions: CkmActions;
  onDone: (message: string) => Promise<void> | void;
}>) {
  const [results, setResults] = useState<CkmArchetype[] | null>(null);
  const [open, setOpen] = useState<CkmArchetype | null>(null);
  const [actionError, setActionError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const lastOpened = useRef<string | null>(null);

  const form = useAppForm({
    defaultValues: { text: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ckmSearchSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: Outcome<CkmArchetype[]>;
      try {
        outcome = await actions.search(value.text.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        setResults(null);
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      setResults(outcome.value);
      requestAnimationFrame(() => resultsHeading.current?.focus());
    },
  });

  const archetype = useQuery({
    ...archetypeElementsQueryOptions(projectId, open?.cid ?? ""),
    enabled: open !== null,
  });

  useEffect(() => {
    if (open) backButton.current?.focus();
  }, [open]);

  async function run(action: () => Promise<Outcome<unknown>>, message: () => string) {
    setActionError(null);
    setBusy(true);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        setActionError(outcome.error);
        return;
      }
      await onDone(message());
    } catch {
      setActionError("unexpected");
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    const view = archetype.data?.ok ? archetype.data.value : null;
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Button
            ref={backButton}
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(null);
              setActionError(null);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>(`[data-ckm-open="${lastOpened.current}"]`)
                  ?.focus(),
              );
            }}
          >
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            {m.board_ckm_back()}
          </Button>
        </div>
        <h3 className="font-medium">
          {m.board_ckm_elements_heading({ name: open.name })}
          <span className="ml-2 font-mono text-xs text-muted-foreground">{open.archetypeId}</span>
        </h3>
        {archetype.isPending && (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            {m.board_ckm_loading()}
          </p>
        )}
        {archetype.isError && <CkmError error="unexpected" />}
        {archetype.data && !archetype.data.ok && <CkmError error={archetype.data.error} />}
        {actionError && <CkmError key={actionError} error={actionError} />}
        {view && (
          <>
            <p className="text-sm text-muted-foreground">
              {m.board_ckm_revision({ revision: view.revision, status: view.status })}
            </p>
            <Table aria-label={m.board_ckm_elements_heading({ name: open.name })}>
              <TableCaption className="sr-only">
                {m.board_ckm_elements_heading({ name: open.name })}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{m.board_ckm_column_name()}</TableHead>
                  <TableHead scope="col">{m.board_ckm_column_at_code()}</TableHead>
                  <TableHead scope="col">{m.board_ckm_column_type()}</TableHead>
                  <TableHead scope="col">{m.board_ckm_column_occurrences()}</TableHead>
                  <TableHead scope="col">{m.board_ckm_column_action()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.elements.map((element, index) => (
                  <TableRow key={element.path}>
                    <TableCell className="whitespace-normal">
                      {element.name}
                      {/* The path tells apart elements with the same name in other events. */}
                      <span
                        id={`ckm-path-${index}`}
                        className="block font-mono text-xs break-all text-muted-foreground"
                      >
                        {element.path}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{element.atCode}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-normal">
                      {rmTypes(element)}
                    </TableCell>
                    <TableCell>{occurrences(element)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-describedby={`ckm-path-${index}`}
                        onClick={() =>
                          run(
                            () => actions.link(view, element),
                            () =>
                              m.board_ckm_linked({
                                name: linkTarget.name,
                                archetypeId: view.archetypeId,
                              }),
                          )
                        }
                      >
                        <LinkIcon aria-hidden="true" data-icon="inline-start" />
                        {m.board_ckm_link_to({ name: element.name })}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <form.FormErrors />
        </form.AppForm>
        <form.AppField name="text">
          {(field) => (
            <field.TextField
              type="search"
              label={m.board_ckm_search_label()}
              description={m.board_ckm_search_description()}
              autoComplete="off"
            />
          )}
        </form.AppField>
        <div>
          <form.AppForm>
            <form.SubmitButton>{m.board_ckm_search_submit()}</form.SubmitButton>
          </form.AppForm>
        </div>
      </form>
      {results && (
        <section className="flex flex-col gap-2" aria-labelledby="ckm-results">
          <h3
            id="ckm-results"
            ref={resultsHeading}
            tabIndex={-1}
            className="font-medium outline-none"
          >
            {m.board_ckm_results_heading()}
          </h3>
          {results.length === 0 ? (
            <p className="text-muted-foreground">{m.board_ckm_no_results()}</p>
          ) : (
            <Table aria-label={m.board_ckm_results_heading()}>
              <TableCaption className="sr-only">{m.board_ckm_results_heading()}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{m.board_ckm_column_name()}</TableHead>
                  <TableHead scope="col">{m.board_ckm_column_id()}</TableHead>
                  <TableHead scope="col">{m.board_ckm_column_status()}</TableHead>
                  <TableHead scope="col">{m.board_ckm_column_revision()}</TableHead>
                  <TableHead scope="col">{m.board_ckm_column_action()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.cid}>
                    <TableCell className="whitespace-normal">{row.name}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-normal break-all">
                      {row.archetypeId}
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.revision}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-ckm-open={row.cid}
                        onClick={() => {
                          lastOpened.current = row.cid;
                          setActionError(null);
                          setOpen(row);
                        }}
                      >
                        {m.board_ckm_open({ name: row.name })}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
