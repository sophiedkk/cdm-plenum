// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The header of every project page (PR4, PR11, PR13, ADR 0019, ADR 0020): a back link, the
// project name and the phases as steps; a done phase links to its recap and the current one to
// the phase home. A participant goes on from the project home, the facilitator from the five tabs
// and the Project menu below the header (ADR 0022).
import { Link, useMatchRoute } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronLeftIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "@/i18n/messages";
import type { ProjectPhase } from "@/lib/project-phases";
import type { ProjectOverview } from "@/lib/project-tasks";
import { PhaseSteps } from "./phase-steps";

type BackTarget = "projects" | "home" | "task";

/**
 * The back link above the name, named for where it goes: the projects, the project (from a
 * recap) or the participant's task on the home.
 */
function BackLink({ projectId, to }: Readonly<{ projectId: string; to: BackTarget }>) {
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
      {to === "task" ? m.projects_back_task() : m.projects_back_home()}
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
  back: BackTarget;
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
  { key: "details", to: "/projects/$projectId/details", label: m.projects_tab_details },
] as const;

/** People and Settings sit in the Project menu, so the tab row stays within five views. */
const MENU = [
  { to: "/projects/$projectId/members", label: m.projects_tab_people },
  { to: "/projects/$projectId/settings", label: m.projects_tab_settings },
] as const;

type TabKey = (typeof TABS)[number]["key"] | "project";

/** The pages that sit under a tab without a tab of their own. */
const UNDER = [
  { to: "/projects/$projectId/export", tab: "overview" },
  { to: "/projects/$projectId/handoff", tab: "overview" },
  { to: "/projects/$projectId/models", tab: "overview" },
  { to: "/projects/$projectId/grouping", tab: "overview" },
  { to: "/projects/$projectId/brainstorm", tab: "elements" },
  { to: "/projects/$projectId/board/import", tab: "elements" },
] as const satisfies readonly { to: string; tab: TabKey }[];

const TAB_LINK =
  "-mb-px inline-flex items-center gap-1 border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground";

/** A recap page belongs to its phase step in the header, so it marks no tab (PR13). */
export function currentTab(matches: (to: string) => boolean): TabKey | null {
  if (matches("/projects/$projectId/recap/$phase")) return null;
  const under = UNDER.find((page) => matches(page.to))?.tab;
  if (under) return under;
  const tab = TABS.find((candidate) => candidate.key !== "overview" && matches(candidate.to));
  if (tab) return tab.key;
  return MENU.some((item) => matches(item.to)) ? "project" : "overview";
}

/**
 * The facilitator's five tabs and the Project menu with People and Settings, in one order in
 * every phase (ADR 0019, ADR 0022). Overview marks only itself and the pages under it; every
 * other tab also marks the pages under it, and the Project trigger marks its two pages. The
 * current tab scrolls into view, as the strip scrolls sideways on a phone.
 */
export function ProjectTabs({ projectId }: Readonly<{ projectId: string }>) {
  const matchRoute = useMatchRoute();
  const params = { projectId };
  const current = currentTab((to) => matchRoute({ to, params, fuzzy: true }) !== false);
  const list = useRef<HTMLUListElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect follows the current tab
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [current]);
  return (
    <nav aria-label={m.projects_tabs_label()} className="mb-6 border-b">
      <ul ref={list} className="flex overflow-x-auto">
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
        <li className="flex">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-current={current === "project" ? "page" : undefined}
                className={TAB_LINK}
              >
                {m.projects_tab_project()}
                <ChevronDownIcon aria-hidden="true" className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {MENU.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <Link to={item.to} params={params} activeOptions={{ exact: true }}>
                    {item.label()}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </nav>
  );
}
