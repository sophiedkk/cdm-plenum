// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// How the project runs (PR14, ADR 0023) for every page below the project layout, for the parts
// that change words with it, such as the export list.
import { createContext, useContext } from "react";
import type { ProjectMode } from "@/lib/project-mode";

const ProjectModeContext = createContext<ProjectMode>("delphi");

export const ProjectModeProvider = ProjectModeContext.Provider;

/** The mode of the project the page belongs to; a Delphi study outside a project layout. */
export function useProjectMode(): ProjectMode {
  return useContext(ProjectModeContext);
}
