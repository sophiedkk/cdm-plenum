// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { type AddModelActions, AddModelButton } from "@/components/sources/add-model";
import { CoverageTable } from "@/components/sources/coverage-table";
import { ModelCards, Suggestions } from "@/components/sources/model-list";
import { usePhaseEdit } from "@/components/status/phase-banner";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { searchCkmFn } from "@/server/ckm/functions";
import { elementKeys } from "@/server/elements/query-options";
import {
  listFhirStructuresFn,
  listFhirVersionsFn,
  searchFhirPackagesFn,
} from "@/server/fhir/functions";
import { projectKeys } from "@/server/projects/query-options";
import {
  acceptSuggestionFn,
  addCkmSourceFn,
  addFhirSourceFn,
  addOtherSourceFn,
  dismissSuggestionFn,
  putOnListFn,
  setBaseModelFn,
  unmatchRowFn,
} from "@/server/sources/functions";
import {
  sourceCoverageQueryOptions,
  sourceKeys,
  sourceModelsQueryOptions,
} from "@/server/sources/query-options";

/**
 * Existing models (EL7, EL12, EL20, ADR 0020): the facilitator adds the models that already
 * describe the concept, compares them in the coverage table and puts the chosen elements on the
 * list; the participants' suggestions wait here to be accepted or dismissed.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/models")({
  beforeLoad: requireStep("models"),
  loader: async ({ context, params }) => {
    const [models, coverage] = await Promise.all([
      context.queryClient.ensureQueryData(sourceModelsQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(sourceCoverageQueryOptions(params.projectId)),
    ]);
    if (!models.ok || !coverage.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.board_models_title()) }],
  }),
  component: ExistingModels,
});

function ExistingModels() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { editable, banner } = usePhaseEdit(project.role, project.phase, "models");
  const { data: models } = useSuspenseQuery(sourceModelsQueryOptions(projectId));
  const { data: coverage } = useSuspenseQuery(sourceCoverageQueryOptions(projectId));
  const searchCkm = useServerFn(searchCkmFn);
  const addCkm = useServerFn(addCkmSourceFn);
  const searchFhir = useServerFn(searchFhirPackagesFn);
  const fhirVersions = useServerFn(listFhirVersionsFn);
  const fhirProfiles = useServerFn(listFhirStructuresFn);
  const addFhir = useServerFn(addFhirSourceFn);
  const addOther = useServerFn(addOtherSourceFn);
  const accept = useServerFn(acceptSuggestionFn);
  const dismiss = useServerFn(dismissSuggestionFn);
  const putOnList = useServerFn(putOnListFn);
  const unmatch = useServerFn(unmatchRowFn);
  const setBase = useServerFn(setBaseModelFn);
  if (!models.ok || !coverage.ok) return <NotFoundState />;

  const refresh = () => queryClient.invalidateQueries({ queryKey: sourceKeys.all(projectId) });
  const actions: AddModelActions = {
    searchCkm: async (text) => {
      const outcome = await searchCkm({ data: { projectId, text, size: 20 } });
      return outcome.ok
        ? {
            ok: true,
            value: outcome.value.map((hit) => ({
              key: hit.cid,
              title: hit.name,
              detail: hit.archetypeId,
            })),
          }
        : outcome;
    },
    addCkm: (cid) => addCkm({ data: { projectId, cid } }),
    searchFhir: async (text) => {
      const outcome = await searchFhir({ data: { projectId, text } });
      return outcome.ok
        ? {
            ok: true,
            value: outcome.value.map((hit) => ({
              key: hit.name,
              title: hit.name,
              detail: hit.description,
            })),
          }
        : outcome;
    },
    fhirVersions: async (packageName) => {
      const outcome = await fhirVersions({ data: { projectId, packageName } });
      return outcome.ok ? { ok: true, value: outcome.value.map((row) => row.version) } : outcome;
    },
    fhirProfiles: async (packageName, version) => {
      const outcome = await fhirProfiles({ data: { projectId, packageName, version } });
      return outcome.ok
        ? {
            ok: true,
            value: outcome.value
              .filter((row) => row.kind === "resource" || row.kind === "logical")
              .map((row) => ({ key: row.url, title: row.title ?? row.name, detail: row.url })),
          }
        : outcome;
    },
    addFhir: (packageName, version, url) =>
      addFhir({ data: { projectId, packageName, version, url } }),
    addOther: (title, link) => addOther({ data: { projectId, title, link } }),
  };
  const added = models.value.filter((model) => model.status !== "suggested");
  const suggestions = models.value.filter((model) => model.status === "suggested");

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_models_title()}
        description={m.board_models_purpose({ project: project.name })}
      />
      {banner}
      <ModelCards
        models={added}
        add={
          editable ? (
            <AddModelButton
              actions={actions}
              onAdded={async () => {
                toast.success(m.board_models_added());
                await refresh();
              }}
            />
          ) : undefined
        }
      />
      {editable && (
        <Suggestions
          suggestions={suggestions}
          accept={(sourceModelId) => accept({ data: { projectId, sourceModelId } })}
          dismiss={(sourceModelId) => dismiss({ data: { projectId, sourceModelId } })}
          onDone={refresh}
        />
      )}
      {coverage.value.rows.length > 0 && (
        <section aria-labelledby="coverage-heading" className="mt-10">
          <h2 id="coverage-heading" className="text-lg font-semibold">
            {m.board_models_coverage_title()}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.board_models_coverage_intro()}</p>
          <CoverageTable
            readOnly={!editable}
            coverage={coverage.value}
            putOnList={(rowIds) => putOnList({ data: { projectId, rowIds } })}
            unmatch={(rowId) => unmatch({ data: { projectId, rowId } })}
            setBase={(sourceModelId, base) => setBase({ data: { projectId, sourceModelId, base } })}
            onListed={async () => {
              await Promise.all([
                refresh(),
                queryClient.invalidateQueries({ queryKey: elementKeys.all(projectId) }),
                queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
              ]);
            }}
          />
        </section>
      )}
    </>
  );
}
