// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The recap of a done phase (PR13, ADR 0020): read only, one view per phase, each fact once.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ReferenceText } from "@/components/board/reference-text";
import { CodeFacts } from "@/components/details/code-facts";
import { ModelTreeView } from "@/components/details/model-tree";
import { StructureFacts } from "@/components/details/structure-facts";
import { DateTime } from "@/components/status/date-time";
import { StatusBadge } from "@/components/status/status-badge";
import { m } from "@/i18n/messages";
import { groupName, modelTypeDescription, modelTypeLabel } from "@/lib/i18n/labels";
import type {
  DecideRecap,
  DetailRecap,
  DiscoverRecap,
  PhaseRecap,
  ScopeRecap,
} from "@/server/projects/recap";

function Closed({ at }: Readonly<{ at: string | null }>) {
  return (
    <p className="text-sm text-muted-foreground">
      {at === null ? (
        m.projects_recap_read_only()
      ) : (
        <>
          {m.projects_recap_closed()} <DateTime value={at} />. {m.projects_recap_read_only()}
        </>
      )}
    </p>
  );
}

function Heading({ title, closedAt }: Readonly<{ title: string; closedAt: string | null }>) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <h2 className="text-xl font-semibold">{title}</h2>
      <Closed at={closedAt} />
    </div>
  );
}

function Num({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <div className="rounded-lg border p-4">
      <dd className="text-3xl font-semibold tabular-nums">{value}</dd>
      <dt className="text-sm text-muted-foreground">{label}</dt>
    </div>
  );
}

function TextBlock({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-semibold">{title}</h3>
      <div className="whitespace-pre-line text-muted-foreground">{children}</div>
    </section>
  );
}

function ScopeView({ recap }: Readonly<{ recap: ScopeRecap }>) {
  const empty = <span>{m.scope_not_written()}</span>;
  return (
    <>
      <Heading title={m.projects_recap_scope_title()} closedAt={recap.closedAt} />
      <div className="flex max-w-3xl flex-col gap-6">
        <TextBlock title={m.scope_model_type_heading()}>
          {recap.modelType === null ? (
            m.scope_model_type_none()
          ) : (
            <>
              {modelTypeLabel(recap.modelType)}: {modelTypeDescription(recap.modelType)}
            </>
          )}
        </TextBlock>
        <TextBlock title={m.scope_concept()}>{recap.concept || empty}</TextBlock>
        <TextBlock title={m.scope_use_cases()}>{recap.useCases || empty}</TextBlock>
        <TextBlock title={m.scope_out_of_scope()}>{recap.outOfScope || empty}</TextBlock>
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold">{m.scope_sources_heading()}</h3>
          {recap.sources.length === 0 ? (
            <p className="text-muted-foreground">{m.projects_recap_empty()}</p>
          ) : (
            <ul className="list-disc pl-5">
              {recap.sources.map((source) => (
                <li key={`${source.label}:${source.url ?? ""}`}>
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      {source.label}
                    </a>
                  ) : (
                    source.label
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function DiscoverView({ projectId, recap }: Readonly<{ projectId: string; recap: DiscoverRecap }>) {
  return (
    <>
      <Heading title={m.projects_recap_discover_title()} closedAt={recap.closedAt} />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Num value={recap.elements} label={m.projects_recap_into_round()} />
        {/* Without models the side section says so once; no "0 from 0" card here. */}
        {recap.models.length > 0 && (
          <Num
            value={recap.fromModels}
            label={m.projects_recap_from_models({ models: recap.models.length })}
          />
        )}
        <Num
          value={recap.added + recap.fromFiles}
          label={
            recap.fromFiles > 0
              ? m.projects_recap_added_files({ people: recap.contributors })
              : m.projects_recap_added({ people: recap.contributors })
          }
        />
        <Num value={recap.merged} label={m.projects_recap_merged()} />
      </dl>
      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="recap-groups" className="flex flex-col gap-4">
          <h3 id="recap-groups" className="text-lg font-semibold">
            {m.projects_recap_groups()}
          </h3>
          {recap.groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-1.5">
              <h4 className="text-sm font-semibold text-muted-foreground">
                {groupName(group)} · {group.elements.length}
              </h4>
              <ul className="flex flex-wrap gap-1.5">
                {group.elements.map((element) => (
                  <li key={element.id} className="rounded-full border px-2.5 text-sm leading-6">
                    {element.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section aria-labelledby="recap-models" className="flex flex-col gap-3">
          <h3 id="recap-models" className="text-lg font-semibold">
            {m.projects_recap_models()}
          </h3>
          {recap.models.length === 0 ? (
            <p className="text-muted-foreground">{m.projects_recap_empty()}</p>
          ) : (
            <ul className="list-disc pl-5">
              {recap.models.map((model) => (
                <li key={`${model.kind}:${model.title}`}>{model.title}</li>
              ))}
            </ul>
          )}
          {recap.firstRound && (
            <p className="mt-4 text-sm text-muted-foreground">
              <Link
                to="/projects/$projectId/rounds/$roundId"
                params={{ projectId, roundId: recap.firstRound.id }}
                className="text-foreground underline underline-offset-4"
              >
                {m.projects_recap_round_results()}
              </Link>
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function DecideView({ projectId, recap }: Readonly<{ projectId: string; recap: DecideRecap }>) {
  return (
    <>
      <Heading title={m.projects_recap_decide_title()} closedAt={recap.closedAt} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <caption className="sr-only">{m.projects_recap_decide_title()}</caption>
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                {m.projects_recap_round()}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {m.projects_recap_rated()}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {m.projects_decided_included()}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {m.projects_decided_excluded()}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {m.projects_decided_open()}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {recap.rounds.map((round) => (
              <tr key={round.id}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <Link
                    to="/projects/$projectId/rounds/$roundId"
                    params={{ projectId, roundId: round.id }}
                    className="underline underline-offset-4"
                  >
                    {m.projects_recap_round_number({ number: round.number })}
                  </Link>
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{round.elements}</td>
                <td className="px-3 py-2 text-right tabular-nums">{round.outcomes.included}</td>
                <td className="px-3 py-2 text-right tabular-nums">{round.outcomes.excluded}</td>
                <td className="px-3 py-2 text-right tabular-nums">{round.outcomes.no_consensus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The model as the detail phase settled it: the tree, then each element with its structure,
 * reference and codes, unsettled parts marked. The recap of Detail and the hand-off page share it.
 */
export function ModelSummary({ recap }: Readonly<{ recap: DetailRecap }>) {
  if (recap.elements.length === 0) {
    return <p className="text-muted-foreground">{m.projects_recap_empty()}</p>;
  }
  return (
    <>
      <section className="mb-12 flex max-w-3xl flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{m.details_tree()}</h3>
          {!recap.treeSettled && <StatusBadge label={m.projects_recap_detail_not_settled()} />}
        </div>
        <ModelTreeView tree={recap.tree} label={m.details_tree()} />
      </section>
      <ul className="flex max-w-3xl flex-col divide-y border-y">
        {recap.elements.map((element) => (
          <li key={element.id} className="flex flex-col gap-2 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{element.name}</h3>
              {!element.settled && <StatusBadge label={m.projects_recap_detail_not_settled()} />}
              {!element.codesSettled && element.reference === null && (
                <StatusBadge label={m.projects_recap_detail_codes_open()} />
              )}
            </div>
            {element.reference && <ReferenceText reference={element.reference} />}
            <StructureFacts structure={element.structure} reference={element.reference !== null} />
            {element.codesSettled && (
              <CodeFacts codes={element.codes} values={element.structure.values} />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function DetailView({ recap }: Readonly<{ recap: DetailRecap }>) {
  return (
    <>
      <Heading title={m.projects_recap_detail_title()} closedAt={recap.closedAt} />
      <ModelSummary recap={recap} />
    </>
  );
}

export function PhaseRecapView({
  projectId,
  recap,
}: Readonly<{ projectId: string; recap: PhaseRecap }>) {
  switch (recap.phase) {
    case "scope":
      return <ScopeView recap={recap} />;
    case "discover":
      return <DiscoverView projectId={projectId} recap={recap} />;
    case "decide":
      return <DecideView projectId={projectId} recap={recap} />;
    case "detail":
      return <DetailView recap={recap} />;
  }
}
