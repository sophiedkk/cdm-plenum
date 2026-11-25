// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The banner of a finished phase (F3 of the UI/UX analysis of 2026-11-25, GNOME HIG banner): the
// facilitator's page reads as a recap and shows editing controls only after "Edit anyway". The
// choice lasts for the visit; the server accepts the facilitator's corrections either way.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { type FacilitatorAccess, facilitatorAccess, type ProjectStep } from "@/lib/phase-access";
import type { ProjectPhase } from "@/lib/project-phases";
import type { ProjectRole } from "@/lib/project-roles";

export function PhaseBanner({ onEdit }: Readonly<{ onEdit: () => void }>) {
  return (
    <div
      data-testid="phase-banner"
      className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border bg-muted p-4"
    >
      <p className="font-semibold">{m.common_phase_finished()}</p>
      <Button type="button" variant="outline" onClick={onEdit}>
        {m.common_phase_edit_anyway()}
      </Button>
    </div>
  );
}

/**
 * The state of a facilitator's page of `step`: `editable` says whether to show its forms and
 * create buttons; `banner` is the finished-phase banner to render above the read view, or null.
 * A participant is never held back here: the phase table and `writeOpen` govern their writes.
 */
export function usePhaseEdit(
  role: ProjectRole,
  phase: ProjectPhase,
  step: ProjectStep,
): { editable: boolean; banner: React.ReactNode } {
  const [forced, setForced] = useState(false);
  const access: FacilitatorAccess =
    role === "facilitator" ? facilitatorAccess(phase, step) : "edit";
  const editable = access === "edit" || forced;
  const banner = editable ? null : (
    <PhaseBanner
      onEdit={() => {
        setForced(true);
        // The button leaves with the banner; the page's first heading takes the focus.
        requestAnimationFrame(() => {
          const heading = document.querySelector<HTMLElement>("main h2");
          heading?.setAttribute("tabindex", "-1");
          heading?.focus();
        });
      }}
    />
  );
  return { editable, banner };
}
