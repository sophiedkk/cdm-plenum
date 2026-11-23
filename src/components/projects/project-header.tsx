// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The header of every project page (PR4, PR11, PR13, ADR 0019, ADR 0020): a back link, the
// project name and the phases as steps; a done phase links to its recap. A participant goes on
// from the project home, the facilitator from the fixed tabs below the header.
import { Link, useMatchRoute } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { m } from "@/i18n/messages";
import type { ProjectPhase } from "@/lib/project-phases";
import type { ProjectOverview } from "@/lib/project-tasks";
import { PhaseSteps } from "./phase-steps";

/** The back link above the name: to the projects, or from a page of the project to its home. */
function BackLink({ projectId, to }: Readonly<{ projectId: string; to: "projects" | "home" }>) {
  const className =
    "inline-flex items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground";
  return to === "projects" ? (
    <Link to="/projects" className={className}>
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {m.projects_back_projects()}
    </Link>
  ) : (
    <Link to="/projects/$projectId" params={{ projectId }} className={className}>
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {m.projects_back_home()}
    </Link>
  );
}

export function ProjectHeader({
  projectId,
  name,
  overview,
  back,
  here,
}: Readonly<{
  projectId: string;
  name: string;
  overview: ProjectOverview;
  back: "projects" | "home";
  /** The phase whose recap the page shows (PR13). */
  here?: ProjectPhase | undefined;
}>) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <BackLink projectId={projectId} to={back} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{name}</h1>
        <PhaseSteps projectId={projectId} phase={overview.phase} here={here} />
      </div>
    </div>
  );
}

const TABS = [
  { key: "overview", to: "/projects/$projectId", label: m.projects_tab_overview },
  { key: "scope", to: "/projects/$projectId/scope", label: m.projects_tab_scope },
  { key: "elements", to: "/projects/$projectId/board", label: m.projects_tab_elements },
  { key: "rounds", to: "/projects/$projectId/rounds", label: m.projects_tab_rounds },
  { key: "people", to: "/projects/$projectId/members", label: m.projects_tab_people },
  { key: "settings", to: "/projects/$projectId/settings", label: m.projects_tab_settings },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** The pages that sit under a tab without a tab of their own. */
const UNDER = [
  { to: "/projects/$projectId/export", tab: "overview" },
  { to: "/projects/$projectId/models", tab: "overview" },
  { to: "/projects/$projectId/grouping", tab: "overview" },
  { to: "/projects/$projectId/brainstorm", tab: "elements" },
  { to: "/projects/$projectId/board/import", tab: "elements" },
] as const satisfies readonly { to: string; tab: TabKey }[];

const TAB_LINK =
  "-mb-px inline-flex border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground";

/**
 * The facilitator's tabs, in one order in every phase (ADR 0019). Overview marks only itself and
 * the export; every other tab also marks the pages under it.
 */
export function ProjectTabs({ projectId }: Readonly<{ projectId: string }>) {
  const matchRoute = useMatchRoute();
  const params = { projectId };
  const current =
    UNDER.find((page) => matchRoute({ to: page.to, params, fuzzy: true }))?.tab ??
    TABS.find((tab) => tab.key !== "overview" && matchRoute({ to: tab.to, params, fuzzy: true }))
      ?.key ??
    "overview";
  return (
    <nav aria-label={m.projects_tabs_label()} className="mb-6 border-b">
      <ul className="flex overflow-x-auto">
        {TABS.map((tab) => (
          <li key={tab.key} className="flex">
            <Link
              to={tab.to}
              params={params}
              activeOptions={{ exact: true }}
              aria-current={tab.key === current ? "page" : undefined}
              className={TAB_LINK}
            >
              {tab.label()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
