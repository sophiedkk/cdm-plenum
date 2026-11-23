// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// "Add a model" on the Existing models page (EL12, ADR 0016): a tab per kind of source. A CKM
// archetype and a FHIR profile are found by a search, then added with one button; another
// source, such as a form or a guideline, takes a title and a link. Every failure of CKM or the
// FHIR registry shows as a translated message in the dialog (R-06).
import { revalidateLogic } from "@tanstack/react-form";
import { PlusIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { FormDialog } from "@/components/members/form-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { refusalMessage } from "@/lib/i18n/refusals";

/** One hit of a search: what to show and what to add. */
export interface ModelHit {
  key: string;
  title: string;
  detail: string;
}

/** The calls the dialog makes; the route passes the server functions. */
export interface AddModelActions {
  searchCkm: (text: string) => Promise<Outcome<ModelHit[]>>;
  addCkm: (cid: string) => Promise<Outcome<unknown>>;
  searchFhir: (text: string) => Promise<Outcome<ModelHit[]>>;
  fhirVersions: (packageName: string) => Promise<Outcome<string[]>>;
  fhirProfiles: (packageName: string, version: string) => Promise<Outcome<ModelHit[]>>;
  addFhir: (packageName: string, version: string, url: string) => Promise<Outcome<unknown>>;
  addOther: (title: string, link: string | null) => Promise<Outcome<unknown>>;
}

const SEARCH_MAX = 100;
const TITLE_MAX = 200;
const LINK_MAX = 2000;

function searchSchema(min: number) {
  return z.object({
    text: z
      .string()
      .trim()
      .min(min, { error: () => m.board_models_search_required({ min }) })
      .max(SEARCH_MAX, { error: () => m.board_text_too_long({ max: SEARCH_MAX }) }),
  });
}

/** The limits of `otherSourceInput` (src/server/sources/schemas.ts), with translated messages. */
export function otherModelSchema() {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, { error: () => m.board_models_title_required() })
      .max(TITLE_MAX, { error: () => m.board_text_too_long({ max: TITLE_MAX }) }),
    link: z
      .string()
      .trim()
      .max(LINK_MAX, { error: () => m.board_text_too_long({ max: LINK_MAX }) })
      .refine((value) => value === "" || /^https?:\/\/\S+$/.test(value), {
        error: () => m.board_models_link_invalid(),
      }),
  });
}

/** A search form whose hits each have one button. */
function SearchAndPick({
  label,
  min,
  search,
  pickLabel,
  pick,
}: Readonly<{
  label: string;
  min: number;
  search: (text: string) => Promise<Outcome<ModelHit[]>>;
  pickLabel: (hit: ModelHit) => string;
  pick: (hit: ModelHit) => Promise<void>;
}>) {
  const [hits, setHits] = useState<ModelHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const form = useAppForm({
    defaultValues: { text: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: searchSchema(min) },
    onSubmit: async ({ value, formApi }) => {
      let outcome: Outcome<ModelHit[]>;
      try {
        outcome = await search(value.text.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        setHits(null);
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      setHits(outcome.value);
      requestAnimationFrame(() => heading.current?.focus());
    },
  });
  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <form.FormErrors />
        </form.AppForm>
        <form.AppField name="text">
          {(field) => <field.TextField label={label} type="search" autoComplete="off" />}
        </form.AppField>
        <div>
          <form.AppForm>
            <form.SubmitButton variant="outline">{m.board_models_search()}</form.SubmitButton>
          </form.AppForm>
        </div>
      </form>
      {hits !== null && (
        <section aria-labelledby={headingId} className="flex flex-col gap-2">
          <h3 id={headingId} ref={heading} tabIndex={-1} className="font-semibold outline-none">
            {m.board_models_hits({ count: hits.length })}
          </h3>
          <ul className="flex max-h-72 flex-col overflow-y-auto border-t">
            {hits.map((hit) => (
              <li key={hit.key} className="flex items-center justify-between gap-3 border-b py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="break-words">{hit.title}</span>
                  <span className="text-sm break-all text-muted-foreground">{hit.detail}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-label={pickLabel(hit)}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await pick(hit);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {m.board_models_pick()}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A FHIR package: its versions in a select, then the profiles of the chosen version. */
function FhirPackage({
  packageName,
  actions,
  added,
}: Readonly<{
  packageName: string;
  actions: AddModelActions;
  added: (outcome: Outcome<unknown>) => void;
}>) {
  const [versions, setVersions] = useState<string[] | null>(null);
  const [version, setVersion] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();
  const { fhirVersions } = actions;
  useEffect(() => {
    let live = true;
    fhirVersions(packageName).then(
      (outcome) => {
        if (!live) return;
        if (!outcome.ok) setError(refusalMessage(outcome.error));
        else {
          setVersions(outcome.value);
          setVersion(outcome.value[0] ?? "");
        }
      },
      () => live && setError(m.common_error_unexpected()),
    );
    return () => {
      live = false;
    };
  }, [fhirVersions, packageName]);
  if (error !== null) return <p className="text-destructive">{error}</p>;
  if (versions === null) return <p className="text-muted-foreground">{m.common_loading()}</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-sm font-medium">
          {m.board_models_fhir_version()}
        </label>
        <select
          id={selectId}
          value={version}
          onChange={(event) => setVersion(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          {versions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      {version !== "" && (
        <FhirProfiles
          key={version}
          packageName={packageName}
          version={version}
          actions={actions}
          added={added}
        />
      )}
    </div>
  );
}

function FhirProfiles({
  packageName,
  version,
  actions,
  added,
}: Readonly<{
  packageName: string;
  version: string;
  actions: AddModelActions;
  added: (outcome: Outcome<unknown>) => void;
}>) {
  const [hits, setHits] = useState<ModelHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingId = useId();
  const { fhirProfiles } = actions;
  useEffect(() => {
    let live = true;
    fhirProfiles(packageName, version).then(
      (outcome) => {
        if (!live) return;
        if (outcome.ok) setHits(outcome.value);
        else setError(refusalMessage(outcome.error));
      },
      () => live && setError(m.common_error_unexpected()),
    );
    return () => {
      live = false;
    };
  }, [fhirProfiles, packageName, version]);
  if (error !== null) return <p className="text-destructive">{error}</p>;
  if (hits === null) return <p className="text-muted-foreground">{m.common_loading()}</p>;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="font-semibold">
        {m.board_models_fhir_profiles({ count: hits.length })}
      </h3>
      <ul className="flex max-h-72 flex-col overflow-y-auto border-t">
        {hits.map((hit) => (
          <li key={hit.key} className="flex items-center justify-between gap-3 border-b py-2">
            <span className="flex min-w-0 flex-col">
              <span className="break-words">{hit.title}</span>
              <span className="text-sm break-all text-muted-foreground">{hit.detail}</span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              aria-label={m.board_models_add_named({ name: hit.title })}
              onClick={async () => {
                setBusy(true);
                try {
                  added(await actions.addFhir(packageName, version, hit.key));
                } catch {
                  setError(m.common_error_unexpected());
                } finally {
                  setBusy(false);
                }
              }}
            >
              {m.board_models_pick()}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OtherModelForm({
  add,
  done,
  cancel,
}: Readonly<{
  add: AddModelActions["addOther"];
  done: () => Promise<void>;
  cancel: ReactNode;
}>) {
  const form = useAppForm({
    defaultValues: { title: "", link: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: otherModelSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: Outcome<unknown>;
      try {
        const link = value.link.trim();
        outcome = await add(value.title.trim(), link === "" ? null : link);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await done();
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="title">
        {(field) => <field.TextField label={m.board_models_title_label()} autoComplete="off" />}
      </form.AppField>
      <form.AppField name="link">
        {(field) => (
          <field.TextField
            label={m.board_models_link_label()}
            description={m.board_models_link_description()}
            type="url"
            autoComplete="off"
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{m.board_models_add()}</form.SubmitButton>
        </form.AppForm>
        {cancel}
      </div>
    </form>
  );
}

function AddModelPanel({
  actions,
  close,
  cancel,
  onAdded,
}: Readonly<{
  actions: AddModelActions;
  close: () => void;
  cancel: ReactNode;
  onAdded: () => Promise<void> | void;
}>) {
  const [error, setError] = useState<string | null>(null);
  const [fhirPackage, setFhirPackage] = useState<string | null>(null);

  async function added(outcome: Outcome<unknown>) {
    if (!outcome.ok) {
      setError(refusalMessage(outcome.error));
      return;
    }
    close();
    await onAdded();
  }

  return (
    <div className="flex flex-col gap-4">
      {error !== null && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Tabs defaultValue="ckm" onValueChange={() => setError(null)}>
        <TabsList>
          <TabsTrigger value="ckm">{m.board_models_kind_ckm()}</TabsTrigger>
          <TabsTrigger value="fhir">{m.board_models_kind_fhir()}</TabsTrigger>
          <TabsTrigger value="other">{m.board_models_kind_other()}</TabsTrigger>
        </TabsList>
        <TabsContent value="ckm" className="pt-4">
          <SearchAndPick
            label={m.board_models_search_ckm()}
            min={1}
            search={actions.searchCkm}
            pickLabel={(hit) => m.board_models_add_named({ name: hit.title })}
            pick={async (hit) => {
              try {
                await added(await actions.addCkm(hit.key));
              } catch {
                setError(m.common_error_unexpected());
              }
            }}
          />
        </TabsContent>
        <TabsContent value="fhir" className="pt-4">
          {fhirPackage === null ? (
            <SearchAndPick
              label={m.board_models_search_fhir()}
              min={2}
              search={actions.searchFhir}
              pickLabel={(hit) => m.board_models_open_package({ name: hit.key })}
              pick={async (hit) => setFhirPackage(hit.key)}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold break-all">{fhirPackage}</span>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0"
                  onClick={() => setFhirPackage(null)}
                >
                  {m.board_models_other_package()}
                </Button>
              </p>
              <FhirPackage
                packageName={fhirPackage}
                actions={actions}
                added={(outcome) => void added(outcome)}
              />
            </div>
          )}
        </TabsContent>
        <TabsContent value="other" className="pt-4">
          <OtherModelForm
            add={actions.addOther}
            cancel={cancel}
            done={async () => {
              close();
              await onAdded();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The dashed "Add a model" tile that opens the dialog. */
export function AddModelButton({
  actions,
  onAdded,
}: Readonly<{ actions: AddModelActions; onAdded: () => Promise<void> | void }>) {
  return (
    <FormDialog
      title={m.board_models_add_title()}
      description={m.board_models_add_description()}
      trigger={
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-26 w-full border-dashed whitespace-normal"
        >
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          {m.board_models_add_title()}
        </Button>
      }
    >
      {({ close, cancel }) => (
        <AddModelPanel actions={actions} close={close} cancel={cancel} onAdded={onAdded} />
      )}
    </FormDialog>
  );
}
