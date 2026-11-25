// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The way from the view of one element, or of the tree, back to the list of elements.
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { m } from "@/i18n/messages";

export function DetailsBack({ projectId }: Readonly<{ projectId: string }>) {
  return (
    <Link
      to="/projects/$projectId/details"
      params={{ projectId }}
      className="mb-2 inline-flex items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {m.details_back_list()}
    </Link>
  );
}
