// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRightIcon, EyeIcon, EyeOffIcon, VoteIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { projectTitle } from "@/components/projects/project-title";
import { DetailFlagList } from "@/components/rounds/detail-flags";
import { ResultsTable } from "@/components/rounds/element-result";
import { toLocalInput } from "@/components/rounds/format";
import { OpenRoundDialog } from "@/components/rounds/open-round-dialog";
import { PanelTable } from "@/components/rounds/panel-setup";
import { ProposalList } from "@/components/rounds/proposals";
import { valueOrNotFound } from "@/components/rounds/result-value";
import { RoundStatusBadge } from "@/components/rounds/round-badges";
import { RoundForm, ruleSentences } from "@/components/rounds/round-form";
import { roundName, withShownNames } from "@/components/rounds/round-kind";
import { RatingsByParticipantTable, ResponseRateTable } from "@/components/rounds/round-tables";
import { type ValueListRow, ValueLists } from "@/components/rounds/value-lists";
import { NotFoundState } from "@/components/shell/route-states";
import { DateTime } from "@/components/status/date-time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { refusalMessage } from "@/lib/i18n/refusals";
import { detailFieldsShown, roundPhaseOf } from "@/lib/phase-access";
import { mayRate } from "@/lib/project-roles";
import { useTimeZone } from "@/lib/time-zone";
import { detailKeys } from "@/server/details/query-options";
import { elementKeys } from "@/server/elements/query-options";
import { projectKeys, projectQueryOptions } from "@/server/projects/query-options";
import {
  addProposalToBoardFn,
  applyValueListFn,
  closeRoundFn,
  openRoundFn,
  removeValueListFn,
  updateRoundFn,
} from "@/server/rounds/functions";
import type { RoundDetail } from "@/server/rounds/queries";
import {
  myRatingsQueryOptions,
  panelStatusQueryOptions,
  ratingsByParticipantQueryOptions,
  responseRateQueryOptions,
  roundBoardQueryOptions,
  roundFlagsQueryOptions,
  roundKeys,
  roundProposalsQueryOptions,
  roundQueryOptions,
  roundResultsQueryOptions,
} from "@/server/rounds/query-options";

/** One round: the setup of a draft, the progress of an open round, the results once closed. */
export const Route = createFileRoute("/_authed/projects/$projectId/rounds/$roundId/")({
  loader: async ({ context, params }) => {
    if (!z.uuid().safeParse(params.roundId).success) throw notFound();
    const { queryClient } = context;
    const { projectId, roundId } = params;
    const round = valueOrNotFound(
      await queryClient.ensureQueryData(roundQueryOptions(projectId, roundId)),
    );
    const isFacilitator = context.project.role === "facilitator";
    const loads: Promise<unknown>[] = [];
    const isValues = round.kind === "values";
    if (isFacilitator && round.status === "draft") {
      if (!isValues) loads.push(queryClient.ensureQueryData(roundBoardQueryOptions(projectId)));
      loads.push(queryClient.ensureQueryData(panelStatusQueryOptions(projectId)));
    }
    if (isFacilitator && round.status !== "draft") {
      loads.push(queryClient.ensureQueryData(responseRateQueryOptions(projectId, roundId)));
      if (detailFieldsShown(context.project.phase) && !isValues) {
        loads.push(queryClient.ensureQueryData(roundFlagsQueryOptions(projectId, roundId)));
      }
      if (round.number === 1 && !isValues) {
        loads.push(queryClient.ensureQueryData(roundProposalsQueryOptions(projectId, roundId)));
      }
      if (round.facilitatorSeesRaters) {
        loads.push(
          queryClient.ensureQueryData(ratingsByParticipantQueryOptions(projectId, roundId)),
        );
      }
    }
    if (round.status === "closed") {
      loads.push(queryClient.ensureQueryData(roundResultsQueryOptions(projectId, roundId)));
    }
    if (round.status === "open") {
      loads.push(queryClient.ensureQueryData(myRatingsQueryOptions(projectId, roundId)));
    }
    await Promise.all(loads);
    return { kind: round.kind, number: round.number };
  },
  head: ({ match, loaderData }) => ({
    meta: [
      {
        title: projectTitle(match.context, loaderData ? roundName(loaderData) : m.rounds_title()),
      },
    ],
  }),
  component: RoundPage,
  notFoundComponent: () => <NotFoundState title={m.rounds_not_found_title()} />,
});

const DISCLOSURE =
  "flex cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden";

/** A summary line of a disclosure with a chevron that turns when it opens. */
function DisclosureSummary({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <summary className={DISCLOSURE}>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-4 transition-transform [details[open]>summary>&]:rotate-90"
      />
      {children}
    </summary>
  );
}

/** Whether the facilitator sees who rated what (DE4), in one sentence with its icon. */
function AnonymityLine({ round }: Readonly<{ round: RoundDetail }>) {
  return (
    <p className="flex items-start gap-2 text-sm">
      {round.facilitatorSeesRaters ? (
        <EyeIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <EyeOffIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      {round.facilitatorSeesRaters ? m.rounds_raters_visible() : m.rounds_raters_hidden()}
    </p>
  );
}

/**
 * The state of the round in one line: status, closing date and number of elements. While the
 * round runs, the rule for inclusion and the anonymity statement follow in short form.
 */
function RoundFacts({ round }: Readonly<{ round: RoundDetail }>) {
  const running = round.status === "open" || round.status === "awaiting_close";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <RoundStatusBadge status={round.status} />
        <span>
          {m.rounds_closes_at_short()} <DateTime value={round.closesAt} />
        </span>
        <span>
          {round.kind === "values"
            ? m.rounds_summary_value_count({ count: round.elements.length })
            : m.rounds_summary_element_count({ count: round.elements.length })}
        </span>
      </p>
      {running && (
        <>
          <p className="text-sm">
            <span className="text-muted-foreground">{m.rounds_summary_rule_short()}</span>{" "}
            {ruleSentences(round.rule, round.kind)[0]}
          </p>
          <AnonymityLine round={round} />
        </>
      )}
    </div>
  );
}

/** The full setup of the round and the panel when it opened, behind a disclosure. */
function RoundSetupDetails({ round }: Readonly<{ round: RoundDetail }>) {
  return (
    <details className="rounded-lg border px-4 py-3">
      <DisclosureSummary>{m.rounds_setup_details()}</DisclosureSummary>
      <div className="mt-4 flex flex-col gap-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{m.rounds_summary_scale()}</dt>
          <dd>{m.rounds_band_range({ from: round.rule.scaleMin, to: round.rule.scaleMax })}</dd>
          <dt className="text-muted-foreground">{m.rounds_summary_rule()}</dt>
          <dd>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {ruleSentences(round.rule, round.kind).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </dd>
          <dt className="text-muted-foreground">{m.rounds_summary_raters()}</dt>
          <dd>
            {round.facilitatorSeesRaters ? m.rounds_raters_visible() : m.rounds_raters_hidden()}
          </dd>
          {round.proposalRule !== null && (
            <>
              <dt className="text-muted-foreground">{m.rounds_summary_proposal_rule()}</dt>
              <dd className="whitespace-pre-line">{round.proposalRule}</dd>
            </>
          )}
        </dl>
        {round.snapshot && <OpeningSnapshot snapshot={round.snapshot} />}
      </div>
    </details>
  );
}

/** The rater's progress in an open round and the way to the rating screen (ADR 0013). */
function RateCall({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(myRatingsQueryOptions(projectId, roundId));
  const mine = valueOrNotFound(data);
  const rated = mine.elements.filter((element) => element.own.rated).length;
  return (
    <section
      aria-labelledby="rate-call-heading"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id="rate-call-heading" className="font-semibold">
          {m.rounds_rate_call_heading()}
        </h3>
        <p className="text-sm">
          {round.kind === "values"
            ? m.rounds_value_rate_progress({ rated, total: mine.elements.length })
            : m.rounds_rate_progress({ rated, total: mine.elements.length })}
        </p>
      </div>
      <Button asChild>
        <Link to="/projects/$projectId/rounds/$roundId/rate" params={{ projectId, roundId }}>
          <VoteIcon aria-hidden="true" />
          {round.kind === "values"
            ? m.rounds_value_rate_now({ number: round.number })
            : m.rounds_rate_now({ number: round.number })}
        </Link>
      </Button>
    </section>
  );
}

function RoundPage() {
  const { projectId, roundId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const { data } = useSuspenseQuery(roundQueryOptions(projectId, roundId));
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  const round = valueOrNotFound(data);
  const isFacilitator = project.role === "facilitator";
  const canRate = detail.ok && mayRate(detail.value.role, detail.value.ownGroupId);
  const closed = round.status === "closed";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{roundName(round)}</h2>
        <RoundFacts round={round} />
      </div>
      {canRate && round.status === "open" && <RateCall round={round} />}
      {closed && <Results projectId={projectId} roundId={roundId} facilitator={isFacilitator} />}
      {isFacilitator && round.status === "draft" && <DraftSetup round={round} />}
      {isFacilitator && round.status !== "draft" && <RoundProgress round={round} />}
      {isFacilitator &&
        round.status !== "draft" &&
        round.kind === "elements" &&
        detailFieldsShown(project.phase) && <Flags round={round} />}
      {isFacilitator &&
        round.status !== "draft" &&
        round.kind === "elements" &&
        round.number === 1 && <Proposals round={round} />}
      {!closed && round.status !== "draft" && (
        <p className="text-sm text-muted-foreground">{m.rounds_results_after_close()}</p>
      )}
      <RoundSetupDetails round={round} />
    </div>
  );
}

function OpeningSnapshot({
  snapshot,
}: Readonly<{ snapshot: NonNullable<RoundDetail["snapshot"]> }>) {
  return (
    <section aria-labelledby="snapshot-heading" className="flex flex-col gap-3">
      <h3 id="snapshot-heading" className="font-semibold">
        {m.rounds_snapshot_heading()}
      </h3>
      <PanelTable
        joined={snapshot.panel}
        minimum={snapshot.minimum}
        caption={m.rounds_snapshot_caption()}
      />
      {snapshot.belowMinimumReason && (
        <div className="text-sm">
          <p className="font-medium">{m.rounds_snapshot_reason()}</p>
          <p className="whitespace-pre-line">{snapshot.belowMinimumReason}</p>
        </div>
      )}
    </section>
  );
}

/** The value lists of a draft value round, from the values it holds (DT3). */
function valueListRows(round: RoundDetail): ValueListRow[] {
  const rows = new Map<string, ValueListRow>();
  for (const item of round.elements) {
    if (!item.value) continue;
    const row = rows.get(item.value.proposalId);
    if (row) row.total += 1;
    else {
      rows.set(item.value.proposalId, {
        proposalId: item.value.proposalId,
        elementName: item.value.elementName,
        total: 1,
      });
    }
  }
  return [...rows.values()];
}

function DraftSetup({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId } = Route.useParams();
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  const revealsBoard = detail.ok && detail.value.privateBrainstorm && !detail.value.boardRevealed;
  const isValues = round.kind === "values";
  // NOTE: PR10. The facilitator prepares a round ahead, but opens an element round in the decide
  // phase only and a value round (DT3) in the detail phase only.
  const mayOpen = detail.ok && detail.value.phase === roundPhaseOf(round.kind);
  // The loader fetched the board of an element round; a value round has none to choose from.
  const { data: boardResult } = useQuery({
    ...roundBoardQueryOptions(projectId),
    enabled: !isValues,
  });
  const { data: panelResult } = useSuspenseQuery(panelStatusQueryOptions(projectId));
  const board = isValues || boardResult === undefined ? null : valueOrNotFound(boardResult);
  const removeValueList = useServerFn(removeValueListFn);
  const panel = valueOrNotFound(panelResult);
  const updateRound = useServerFn(updateRoundFn);
  const openRound = useServerFn(openRoundFn);
  const queryClient = useQueryClient();
  const timeZone = useTimeZone();
  const refreshProject = () =>
    queryClient.invalidateQueries({ queryKey: roundKeys.project(projectId) });

  return (
    <>
      <section aria-labelledby="setup-heading" className="flex max-w-3xl flex-col gap-4">
        <h3 id="setup-heading" className="text-lg font-semibold">
          {m.rounds_setup_heading()}
        </h3>
        <RoundForm
          kind={round.kind}
          key={`${timeZone}-${round.closesAt}-${round.elements.length}-${JSON.stringify(round.rule)}-${round.facilitatorSeesRaters}-${round.proposalRule}`}
          elements={board}
          initial={{
            elementIds: isValues ? [] : round.elements.map((element) => element.id),
            rule: round.rule,
            facilitatorSeesRaters: round.facilitatorSeesRaters,
            closesAt: toLocalInput(round.closesAt, timeZone),
            ...(round.number === 1 ? { proposalRule: round.proposalRule ?? "" } : {}),
          }}
          submitLabel={m.rounds_save_draft()}
          save={async (setup) => {
            const result = await updateRound({ data: { projectId, roundId: round.id, ...setup } });
            if (!result.ok) return result;
            return { ok: true };
          }}
          onSaved={async () => {
            await refreshProject();
            toast.success(m.rounds_draft_saved());
          }}
        />
      </section>
      {isValues && (
        <ValueLists
          mode="draft"
          rows={valueListRows(round)}
          act={async (proposalId) => {
            const result = await removeValueList({
              data: { projectId, roundId: round.id, proposalId },
            });
            if (!result.ok) return result;
            await Promise.all([
              refreshProject(),
              queryClient.invalidateQueries({ queryKey: detailKeys.all(projectId) }),
            ]);
            return { ok: true };
          }}
        />
      )}
      <section aria-labelledby="open-heading" className="flex max-w-3xl flex-col gap-4">
        <h3 id="open-heading" className="text-lg font-semibold">
          {m.rounds_open_heading()}
        </h3>
        <p>{m.rounds_open_intro()}</p>
        <PanelTable
          joined={panel.joined}
          minimum={panel.minimum}
          caption={m.rounds_panel_caption()}
        />
        {panel.shortfall.length > 0 && (
          <Alert>
            <AlertDescription>{m.rounds_open_shortfall_hint()}</AlertDescription>
          </Alert>
        )}
        {!mayOpen ? (
          <p className="text-sm text-muted-foreground">
            {isValues ? m.rounds_value_open_in_detail() : m.rounds_open_in_decide()}
          </p>
        ) : (
          <div>
            <OpenRoundDialog
              number={round.number}
              revealsBoard={revealsBoard}
              open={(reason) =>
                openRound({
                  data: {
                    projectId,
                    roundId: round.id,
                    ...(reason === undefined ? {} : { belowMinimumReason: reason }),
                  },
                })
              }
              onOpened={async (status) => {
                await refreshProject();
                toast.success(
                  status === "below_minimum"
                    ? m.rounds_opened_below_minimum({ number: round.number })
                    : m.rounds_opened({ number: round.number }),
                );
              }}
            />
          </div>
        )}
      </section>
    </>
  );
}

function CloseRound({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId } = Route.useParams();
  const closeRound = useServerFn(closeRoundFn);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (round.status === "open") {
    return <p className="text-muted-foreground">{m.rounds_close_not_due()}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p>{m.rounds_close_due()}</p>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" className="self-start" disabled={busy} aria-busy={busy}>
            {m.rounds_close_button()}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.rounds_close_title({ number: round.number })}</AlertDialogTitle>
            <AlertDialogDescription>
              {round.kind === "values"
                ? m.rounds_value_close_explained()
                : m.rounds_close_explained()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const result = await closeRound({ data: { projectId, roundId: round.id } });
                  if (!result.ok) {
                    setError(refusalMessage(result.error));
                    return;
                  }
                  await queryClient.invalidateQueries({ queryKey: roundKeys.project(projectId) });
                  toast.success(m.rounds_closed({ number: round.number }));
                } catch {
                  setError(m.common_error_unexpected());
                } finally {
                  setBusy(false);
                }
              }}
            >
              {m.rounds_close_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoundProgress({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(responseRateQueryOptions(projectId, roundId));
  const rate = valueOrNotFound(data);
  return (
    <section aria-labelledby="progress-heading" className="flex flex-col gap-3">
      <h3 id="progress-heading" className="text-lg font-semibold">
        {m.rounds_progress_heading()}
      </h3>
      <p>
        {m.rounds_response_summary({
          completed: rate.total.completed,
          started: rate.total.started,
          invited: rate.total.invited,
        })}
      </p>
      <details>
        <DisclosureSummary>{m.rounds_response_by_group()}</DisclosureSummary>
        <div className="mt-2">
          <ResponseRateTable rate={rate} />
        </div>
      </details>
      {round.status !== "closed" && <CloseRound round={round} />}
      {round.facilitatorSeesRaters && <ByParticipant round={round} />}
    </section>
  );
}

function ByParticipant({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(ratingsByParticipantQueryOptions(projectId, roundId));
  const participants = valueOrNotFound(data);
  return (
    <details>
      <DisclosureSummary>{m.rounds_by_participant_heading()}</DisclosureSummary>
      <div className="mt-2">
        <RatingsByParticipantTable
          participants={participants}
          elements={withShownNames(round.elements)}
        />
      </div>
    </details>
  );
}

function Results({
  projectId,
  roundId,
  facilitator,
}: Readonly<{ projectId: string; roundId: string; facilitator: boolean }>) {
  const { data } = useSuspenseQuery(roundResultsQueryOptions(projectId, roundId));
  const results = valueOrNotFound(data);
  const applyValueList = useServerFn(applyValueListFn);
  const queryClient = useQueryClient();
  const isValues = results.round.kind === "values";
  const names = new Map(results.lists.map((list) => [list.proposalId, list.elementName]));
  return (
    <>
      <section aria-labelledby="results-heading" className="flex flex-col gap-2">
        <h3 id="results-heading" className="text-lg font-semibold">
          {m.rounds_results_heading()}
        </h3>
        <ResultsTable
          kind={results.round.kind}
          elements={isValues ? withShownNames(results.elements) : results.elements}
        />
        <p className="text-sm text-muted-foreground">{m.rounds_results_intro()}</p>
      </section>
      {isValues && (
        <ValueLists
          mode="closed"
          canAct={facilitator}
          rows={results.lists.map((list) => ({
            proposalId: list.proposalId,
            elementName: list.elementName,
            total: list.total,
            kept: list.kept,
            appliedVersion: list.appliedVersion,
            changed: list.appliedVersion === null && list.currentVersion !== list.version,
          }))}
          act={async (proposalId) => {
            const result = await applyValueList({ data: { projectId, roundId, proposalId } });
            if (!result.ok) return result;
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: roundKeys.project(projectId) }),
              queryClient.invalidateQueries({ queryKey: detailKeys.all(projectId) }),
              queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
            ]);
            toast.success(
              m.rounds_value_list_apply_done({
                name: names.get(proposalId) ?? "",
                version: result.value.version,
              }),
            );
            return { ok: true };
          }}
        />
      )}
    </>
  );
}

/**
 * Who proposed what (DE16) or set which detail flag (DE17), from the ratings by participant,
 * when the round allows it (DE4).
 */
function useAuthors(
  round: RoundDetail,
  ids: "proposalIds" | "flagIds",
): ReadonlyMap<string, string> | undefined {
  const { projectId, roundId } = Route.useParams();
  const { data } = useQuery({
    ...ratingsByParticipantQueryOptions(projectId, roundId),
    enabled: round.facilitatorSeesRaters,
  });
  if (!round.facilitatorSeesRaters || !data?.ok) return undefined;
  const authors = new Map<string, string>();
  for (const participant of data.value) {
    for (const id of participant[ids]) {
      authors.set(id, participant.name.trim() || participant.email);
    }
  }
  return authors;
}

/** The detail flags of the round per element, for the facilitator (DE17). */
function Flags({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(roundFlagsQueryOptions(projectId, roundId));
  const flags = valueOrNotFound(data);
  const flaggers = useAuthors(round, "flagIds");
  return <DetailFlagList elements={round.elements} flags={flags} flaggers={flaggers} />;
}

/** The proposals for missing elements of round 1, for the facilitator (DE16). */
function Proposals({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(roundProposalsQueryOptions(projectId, roundId));
  const proposals = valueOrNotFound(data);
  const proposers = useAuthors(round, "proposalIds");
  const addToBoard = useServerFn(addProposalToBoardFn);
  const queryClient = useQueryClient();
  return (
    <ProposalList
      proposals={proposals}
      proposers={proposers}
      addToBoard={async (proposal) => {
        const result = await addToBoard({
          data: { projectId, roundId, proposalId: proposal.id },
        });
        if (!result.ok) return result;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: roundKeys.proposals(projectId, roundId) }),
          queryClient.invalidateQueries({ queryKey: roundKeys.elements(projectId) }),
          queryClient.invalidateQueries({ queryKey: elementKeys.all(projectId) }),
        ]);
        toast.success(m.rounds_proposals_added({ name: proposal.name }));
        return { ok: true };
      }}
    />
  );
}
