// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { projectTitle } from "@/components/projects/project-title";
import { valueOrNotFound } from "@/components/rounds/result-value";
import { RoundForm } from "@/components/rounds/round-form";
import { PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { DEFAULT_RULE } from "@/lib/consensus";
import { createRoundFn } from "@/server/rounds/functions";
import {
  roundBoardQueryOptions,
  roundKeys,
  roundResultsQueryOptions,
  roundsQueryOptions,
} from "@/server/rounds/query-options";

/**
 * A new draft round (DE1, DE7), for the facilitator. The elements start as the server proposes
 * them: every element of the board for the first round, then those without consensus.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/rounds/new")({
  beforeLoad: ({ context, params }) => {
    if (context.project.role !== "facilitator") {
      throw redirect({ to: "/projects/$projectId/rounds", params });
    }
  },
  loader: async ({ context, params }) => {
    const { queryClient } = context;
    const rounds = valueOrNotFound(
      await queryClient.ensureQueryData(roundsQueryOptions(params.projectId)),
    );
    if (rounds.some((round) => round.status !== "closed")) {
      throw redirect({ to: "/projects/$projectId/rounds", params });
    }
    valueOrNotFound(await queryClient.ensureQueryData(roundBoardQueryOptions(params.projectId)));
    const latest = rounds[0];
    if (latest) {
      await queryClient.ensureQueryData(roundResultsQueryOptions(params.projectId, latest.id));
    }
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.rounds_new_title()) }] }),
  component: NewRound,
});

function NewRound() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const { data: roundsResult } = useSuspenseQuery(roundsQueryOptions(projectId));
  const { data: boardResult } = useSuspenseQuery(roundBoardQueryOptions(projectId));
  const latest = valueOrNotFound(roundsResult)[0];
  const board = valueOrNotFound(boardResult);
  const createRound = useServerFn(createRoundFn);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  let defaultIds = board.map((element) => element.id);
  if (latest) {
    const results = queryClient.getQueryData(
      roundResultsQueryOptions(projectId, latest.id).queryKey,
    );
    const open = new Set(
      results?.ok
        ? results.value.elements.filter((e) => e.outcome === "no_consensus").map((e) => e.id)
        : [],
    );
    defaultIds = defaultIds.filter((id) => open.has(id));
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        level={2}
        title={m.rounds_new_title()}
        description={
          latest && defaultIds.length > 0
            ? m.rounds_new_description_next({ number: latest.number })
            : m.rounds_new_description()
        }
      />
      <RoundForm
        mode={project.mode}
        elements={board}
        initial={{
          elementIds: defaultIds,
          rule: DEFAULT_RULE,
          facilitatorSeesRaters: false,
          closesAt: "",
          // DE16: only round 1 asks for missing elements.
          ...(latest ? {} : { proposalRule: m.rounds_proposal_rule_default() }),
        }}
        submitLabel={m.rounds_create()}
        save={async (setup) => {
          const result = await createRound({ data: { projectId, ...setup } });
          if (!result.ok) return result;
          await queryClient.invalidateQueries({ queryKey: roundKeys.list(projectId) });
          toast.success(m.rounds_created({ number: result.value.number }));
          await navigate({
            to: "/projects/$projectId/rounds/$roundId",
            params: { projectId, roundId: result.value.roundId },
          });
          return { ok: true };
        }}
        onSaved={() => {}}
        actions={
          <Button asChild variant="outline">
            <Link to="/projects/$projectId/rounds" params={{ projectId }}>
              {m.common_cancel()}
            </Link>
          </Button>
        }
      />
    </div>
  );
}
