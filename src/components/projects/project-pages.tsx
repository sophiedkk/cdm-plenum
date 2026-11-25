// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The pages a participant reads from the project home besides their task (ADR 0019): the scope
// and the elements. Each link says the heading of the page it opens, so the page confirms where
// you are; every such page leads back to the home.
import { Link } from "@tanstack/react-router";
import { m } from "@/i18n/messages";
import type { HomePage } from "@/lib/project-home";

const PAGES = {
  scope: { to: "/projects/$projectId/scope", label: m.scope_title },
  board: { to: "/projects/$projectId/board", label: m.board_title },
} as const satisfies Record<HomePage, { to: string; label: () => string }>;

export function ProjectPages({
  projectId,
  pages,
}: Readonly<{ projectId: string; pages: readonly HomePage[] }>) {
  if (pages.length === 0) return null;
  return (
    <nav aria-labelledby="project-pages-heading" className="mt-12 flex flex-col gap-3">
      <h2 id="project-pages-heading" className="type-section">
        {m.projects_home_pages_title()}
      </h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {pages.map((page) => (
          <li key={page}>
            <Link
              to={PAGES[page].to}
              params={{ projectId }}
              className="underline underline-offset-4"
            >
              {PAGES[page].label()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
