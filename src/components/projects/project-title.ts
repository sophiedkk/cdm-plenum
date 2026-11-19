// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { m } from "@/i18n/messages";

/**
 * The document title of a project page (WCAG 2.4.2): the page, the project, the app. `head()`
 * also runs when the project layout threw `notFound()`, so the project can be missing.
 */
export function projectTitle(context: { project?: { name: string } }, page?: string): string {
  const project = context.project?.name ?? m.projects_not_found_title();
  return [page, project, m.app_name()].filter((part) => part !== undefined).join(" | ");
}
