// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";
import { dataTypeText } from "@/components/board/element-details";
import { projectTitle } from "@/components/projects/project-title";
import type { ElementDetails } from "@/components/rounds/detail-flags";
import { ProposeSection } from "@/components/rounds/proposals";
import { RatingCards, shownCard } from "@/components/rounds/rating-cards";
import { RatingElement } from "@/components/rounds/rating-element";
import { valueOrNotFound } from "@/components/rounds/result-value";
import { RoundStatusBadge } from "@/components/rounds/round-badges";
import { NotFoundState } from "@/components/shell/route-states";
import { DateTime } from "@/components/status/date-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import { mayRate } from "@/lib/project-roles";
import type { BoardElement } from "@/server/elements/queries";
import { projectKeys, projectQueryOptions } from "@/server/projects/query-options";
import type { OwnFlag } from "@/server/rounds/flags";
import {
  addProposalFn,
  clearRatingFn,
  deleteProposalFn,
  removeDetailFlagFn,
  saveDetailFlagFn,
  saveRatingFn,
} from "@/server/rounds/functions";
import {
  myProposalsQueryOptions,
  myRatingsQueryOptions,
  roundBoardQueryOptions,
  roundKeys,
} from "@/server/rounds/query-options";
import type { MyElement, MyRatings, OwnRating } from "@/server/rounds/ratings";
import { DETAIL_FLAG_KINDS, type DetailFlagKind } from "@/server/rounds/schemas";

/** The card shown: its number from 1, or the overview after the last card (DE18). */
const searchSchema = z.object({
  card: z
    .union([z.int().min(1).max(100_000), z.literal("overview")])
    .optional()
    .catch(undefined),
});

/**
 * The rating screen of an open round (DE3, DE4, DE7, DE8), one element per card with an
 * overview after the last (DE18), for participants and for a facilitator who joined a
 * stakeholder group (DE14). A facilitator without a group sees the cards read-only and where to
 * join one. The overview ends round 1 with the open question for missing elements (DE16).
 */
export const Route = createFileRoute("/_authed/projects/$projectId/rounds/$roundId/rate")({
  validateSearch: searchSchema,
  loader: async ({ context, params }) => {
    if (!z.uuid().safeParse(params.roundId).success) throw notFound();
    const { queryClient } = context;
    const [mine] = await Promise.all([
      queryClient.ensureQueryData(myRatingsQueryOptions(params.projectId, params.roundId)),
      queryClient.ensureQueryData(roundBoardQueryOptions(params.projectId)),
    ]);
    const { number } = valueOrNotFound(mine).round;
    if (number === 1) {
      await queryClient.ensureQueryData(myProposalsQueryOptions(params.projectId, params.roundId));
    }
    return { number };
  },
  head: ({ match, loaderData }) => ({
    meta: [
      {
        title: projectTitle(
          match.context,
          loaderData ? m.rounds_rate_title({ number: loaderData.number }) : m.rounds_title(),
        ),
      },
    ],
  }),
  component: RatePage,
  notFoundComponent: () => <NotFoundState title={m.rounds_not_found_title()} />,
});

/** The details of an element as its card shows them; unknown elements have none chosen. */
function detailsOf(element: BoardElement | undefined): ElementDetails {
  if (!element) return { dataType: null, cardinality: null, values: [] };
  return {
    dataType: element.dataType === null && element.ckmLink === null ? null : dataTypeText(element),
    cardinality: element.cardinality === null ? null : formatCardinality(element.cardinality),
    values: element.values.map((value) =>
      value.value === null ? value.text : `${value.value}: ${value.text}`,
    ),
  };
}

function withFlag(flags: readonly OwnFlag[], kind: DetailFlagKind, reason: string | null) {
  const rest = flags.filter((flag) => flag.kind !== kind);
  const next = reason === null ? rest : [...rest, { kind, reason }];
  return next.sort((a, b) => DETAIL_FLAG_KINDS.indexOf(a.kind) - DETAIL_FLAG_KINDS.indexOf(b.kind));
}

function RatePage() {
  const { projectId, roundId } = Route.useParams();
  const { card } = Route.useSearch();
  const { data } = useSuspenseQuery(myRatingsQueryOptions(projectId, roundId));
  const { data: boardResult } = useSuspenseQuery(roundBoardQueryOptions(projectId));
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  const canRate = detail.ok && mayRate(detail.value.role, detail.value.ownGroupId);
  const mine = valueOrNotFound(data);
  const board = valueOrNotFound(boardResult);
  const saveRating = useServerFn(saveRatingFn);
  const clearRating = useServerFn(clearRatingFn);
  const saveFlag = useServerFn(saveDetailFlagFn);
  const removeFlag = useServerFn(removeDetailFlagFn);
  const queryClient = useQueryClient();
  const { round, elements } = mine;
  const editable = round.status === "open" && canRate;
  const rated = elements.filter((element) => element.own.rated).length;
  const boardElements = new Map(board.map((element) => [element.id, element]));
  const queryKey = myRatingsQueryOptions(projectId, roundId).queryKey;
  const total = elements.length;
  const shown = shownCard(card, total);
  const navigate = useNavigate({ from: Route.fullPath });

  /** Keeps the cached element in step with a save, so the progress counts it at once. */
  const remember = (elementId: string, change: (element: MyElement) => MyElement) => {
    queryClient.setQueryData(queryKey, (old) => {
      if (!old?.ok) return old;
      const value: MyRatings = {
        ...old.value,
        elements: old.value.elements.map((item) => (item.id === elementId ? change(item) : item)),
      };
      return { ...old, value };
    });
    // The header counts the rated elements (PR11).
    void queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) });
  };
  const rememberOwn = (elementId: string, own: OwnRating) =>
    remember(elementId, (item) => ({ ...item, own }));

  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold">{m.rounds_rate_title({ number: round.number })}</h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <RoundStatusBadge status={round.status} />
          <span>
            {m.rounds_closes_at_short()} <DateTime value={round.closesAt} />
          </span>
          <span className="font-medium">{m.rounds_rate_progress({ rated, total })}</span>
          <span className="flex items-center gap-2">
            {round.facilitatorSeesRaters ? (
              <EyeIcon aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <EyeOffIcon aria-hidden="true" className="size-4 shrink-0" />
            )}
            <strong className="font-medium">
              {round.facilitatorSeesRaters
                ? m.rounds_rate_visible_title()
                : m.rounds_rate_hidden_title()}
            </strong>
          </span>
        </p>
        <p className="text-sm text-muted-foreground">{m.rounds_rate_intro()}</p>
      </div>
      {!canRate && (
        <Alert>
          <AlertTitle>{m.rounds_rate_no_group_title()}</AlertTitle>
          <AlertDescription>
            <p>
              {m.rounds_rate_no_group()}{" "}
              <Link
                to="/projects/$projectId/settings"
                params={{ projectId }}
                className="underline underline-offset-4"
              >
                {m.rounds_rate_settings_link()}
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      )}
      {round.status !== "open" && (
        <Alert>
          <AlertDescription>{m.rounds_rate_not_open()}</AlertDescription>
        </Alert>
      )}
      <RatingCards
        number={round.number}
        elements={elements}
        shown={shown}
        cardLink={(index, children, className, current) => (
          <Link
            to="/projects/$projectId/rounds/$roundId/rate"
            params={{ projectId, roundId }}
            search={{ card: index }}
            className={className}
            // The router marks the link to the URL's own card the same way.
            aria-current={current ? "page" : undefined}
          >
            {children}
          </Link>
        )}
        go={(index) => {
          void navigate({ search: { card: index } });
        }}
        renderCard={(element, position, headingRef, progress) => (
          <RatingElement
            key={element.id}
            element={element}
            details={detailsOf(boardElements.get(element.id))}
            position={position}
            progress={progress}
            headingRef={headingRef}
            rule={round.rule}
            editable={editable}
            save={async (score, reason) => {
              const result = await saveRating({
                data: { projectId, roundId, elementId: element.id, score, reason },
              });
              if (result.ok) {
                const trimmed = reason.trim();
                rememberOwn(element.id, {
                  rated: true,
                  score,
                  reason: trimmed === "" ? null : trimmed,
                });
              }
              return result.ok ? { ok: true } : result;
            }}
            clear={async () => {
              const result = await clearRating({
                data: { projectId, roundId, elementId: element.id },
              });
              if (result.ok) rememberOwn(element.id, { rated: false, score: null, reason: null });
              return result.ok ? { ok: true } : result;
            }}
            saveFlag={async (kind, reason) => {
              const result = await saveFlag({
                data: { projectId, roundId, elementId: element.id, kind, reason },
              });
              if (!result.ok) return result;
              remember(element.id, (item) => ({
                ...item,
                flags: withFlag(item.flags, kind, reason),
              }));
              return { ok: true };
            }}
            removeFlag={async (kind) => {
              const result = await removeFlag({
                data: { projectId, roundId, elementId: element.id, kind },
              });
              if (!result.ok) return result;
              remember(element.id, (item) => ({
                ...item,
                flags: withFlag(item.flags, kind, null),
              }));
              return { ok: true };
            }}
          />
        )}
        afterOverview={
          round.number === 1 && <Proposals editable={editable} rule={round.proposalRule} />
        }
      />
      <p className="text-sm text-muted-foreground">
        {round.facilitatorSeesRaters ? m.rounds_raters_visible() : m.rounds_raters_hidden()}{" "}
        {m.rounds_rate_autosave()}{" "}
        <Link
          to="/projects/$projectId/rounds"
          params={{ projectId }}
          className="underline underline-offset-4"
        >
          {m.rounds_back_to_rounds()}
        </Link>
      </p>
    </div>
  );
}

/** The rater's own proposals for missing elements and the form for a new one (DE16). */
function Proposals({ editable, rule }: Readonly<{ editable: boolean; rule: string | null }>) {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(myProposalsQueryOptions(projectId, roundId));
  const proposals = valueOrNotFound(data);
  const addProposal = useServerFn(addProposalFn);
  const deleteProposal = useServerFn(deleteProposalFn);
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: roundKeys.myProposals(projectId, roundId) });
  return (
    <ProposeSection
      rule={rule}
      proposals={proposals}
      editable={editable}
      add={async (name, description) => {
        const result = await addProposal({ data: { projectId, roundId, name, description } });
        if (!result.ok) return result;
        await refresh();
        return { ok: true };
      }}
      remove={async (proposalId) => {
        const result = await deleteProposal({ data: { projectId, roundId, proposalId } });
        if (!result.ok) return result;
        await refresh();
        return { ok: true };
      }}
    />
  );
}
